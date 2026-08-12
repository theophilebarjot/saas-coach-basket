// supabase/functions/create-portal-session/index.ts

import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Méthode non autorisée" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
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

    // ---- Récupération du stripe_customer_id du coach : le portail Stripe
    //      a besoin de savoir QUEL client Stripe on veut gérer. ----
    const { data: abonnement, error: abonnementError } = await supabaseAdmin
      .from("abonnements")
      .select("stripe_customer_id")
      .eq("coach_id", userData.user.id)
      .maybeSingle();

    if (abonnementError || !abonnement?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: "Aucun abonnement Stripe trouvé pour ce coach" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const corps = new URLSearchParams();
    corps.append("customer", abonnement.stripe_customer_id);
    corps.append("return_url", "saascoachbasket://retour-abonnement");

    const reponseStripe = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")!}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: corps.toString(),
    });

    if (!reponseStripe.ok) {
      const detail = await reponseStripe.json().catch(() => ({}));
      console.error("Erreur Stripe (portail):", detail);
      return new Response(
        JSON.stringify({ error: "Échec de création de la session du portail" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const session = await reponseStripe.json();

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erreur create-portal-session:", err);
    return new Response(
      JSON.stringify({ error: "Erreur serveur", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});