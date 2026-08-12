// supabase/functions/create-checkout-session/index.ts

import { createClient } from "npm:@supabase/supabase-js@2";

const SCHEME = "saascoachbasket";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Méthode non autorisée" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { plan } = await req.json();

    const mappingPrix: Record<string, string | undefined> = {
      mensuel: Deno.env.get("STRIPE_PRICE_MENSUEL"),
      six_mois: Deno.env.get("STRIPE_PRICE_SIX_MOIS"),
      annuel: Deno.env.get("STRIPE_PRICE_ANNUEL"),
    };

    const priceId = mappingPrix[plan];
    if (!priceId) {
      return new Response(JSON.stringify({ error: "Plan invalide" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ---- Authentification : qui est le coach qui s'abonne ? ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const jwt = authHeader.replace("Bearer ", "");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(jwt);

    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Token invalide" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const coach = userData.user;

    // ---- Construction de la requête Stripe Checkout ----
    // On utilise l'API REST de Stripe directement (fetch + form-encoded)
    // plutôt que le SDK npm, pour rester léger et éviter les incompatibilités
    // connues entre certains SDK Node et l'environnement Deno des Edge Functions.
    const corps = new URLSearchParams();
    corps.append("mode", "subscription");
    corps.append("line_items[0][price]", priceId);
    corps.append("line_items[0][quantity]", "1");
    corps.append("customer_email", coach.email ?? "");
    corps.append("client_reference_id", coach.id);
    corps.append("metadata[coach_id]", coach.id);
    corps.append("success_url", `${SCHEME}://abonnement-succes`);
    corps.append("cancel_url", `${SCHEME}://abonnement-annule`);

    const reponseStripe = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")!}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: corps.toString(),
    });

    if (!reponseStripe.ok) {
      const detail = await reponseStripe.json().catch(() => ({}));
      console.error("Erreur Stripe:", detail);
      return new Response(
        JSON.stringify({ error: "Échec de création de la session de paiement" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const session = await reponseStripe.json();

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erreur create-checkout-session:", err);
    return new Response(
      JSON.stringify({ error: "Erreur serveur", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});