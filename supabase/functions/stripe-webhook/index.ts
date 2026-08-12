// supabase/functions/stripe-webhook/index.ts

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

// Deno n'a pas le même moteur crypto que Node par défaut -- Stripe fournit
// un fournisseur basé sur SubtleCrypto (natif du navigateur/Deno) pour que
// la vérification de signature fonctionne dans cet environnement.
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function nomPlanDepuisPriceId(priceId: string): string | null {
  const mapping: Record<string, string> = {
    [Deno.env.get("STRIPE_PRICE_MENSUEL")!]: "mensuel",
    [Deno.env.get("STRIPE_PRICE_SIX_MOIS")!]: "six_mois",
    [Deno.env.get("STRIPE_PRICE_ANNUEL")!]: "annuel",
  };
  return mapping[priceId] ?? null;
}

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const corpsBrut = await req.text();

  if (!signature) {
    return new Response("Signature manquante", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      corpsBrut,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    );
  } catch (err) {
    console.error("Signature webhook invalide:", err);
    return new Response("Signature invalide", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const coachId = session.client_reference_id ?? session.metadata?.coach_id;

        if (!coachId) {
          console.error("checkout.session.completed sans coach_id, session:", session.id);
          break;
        }

        const subscriptionId = session.subscription as string;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price.id;
        const plan = priceId ? nomPlanDepuisPriceId(priceId) : null;

        const { error } = await supabaseAdmin
          .from("abonnements")
          .update({
            statut: "actif",
            plan,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: subscriptionId,
            date_debut: new Date(subscription.current_period_start * 1000).toISOString(),
            date_fin: new Date(subscription.current_period_end * 1000).toISOString(),
          })
          .eq("coach_id", coachId);

        if (error) {
          console.error("Échec mise à jour abonnement (checkout.session.completed):", error);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const priceId = subscription.items.data[0]?.price.id;
        const plan = priceId ? nomPlanDepuisPriceId(priceId) : null;

        let statutInterne: string;
        switch (subscription.status) {
          case "active":
            statutInterne = "actif";
            break;
          case "past_due":
          case "unpaid":
            statutInterne = "impaye";
            break;
          case "canceled":
            statutInterne = "annule";
            break;
          default:
            statutInterne = subscription.status;
        }

        const { error } = await supabaseAdmin
          .from("abonnements")
          .update({
            statut: statutInterne,
            plan,
            date_fin: new Date(subscription.current_period_end * 1000).toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id);

        if (error) {
          console.error("Échec mise à jour abonnement (customer.subscription.updated):", error);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        const { error } = await supabaseAdmin
          .from("abonnements")
          .update({ statut: "annule" })
          .eq("stripe_subscription_id", subscription.id);

        if (error) {
          console.error("Échec mise à jour abonnement (customer.subscription.deleted):", error);
        }
        break;
      }

      default:
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erreur traitement webhook:", err);
    return new Response(JSON.stringify({ received: true, erreur_interne: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});