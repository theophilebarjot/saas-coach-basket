// supabase/functions/envoyer-consentement-parental/index.ts

import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Méthode non autorisée" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { joueur_id, email_parent } = await req.json();
    if (!joueur_id || typeof joueur_id !== "string") {
      return new Response(JSON.stringify({ error: "joueur_id manquant" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

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

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Token invalide" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const callerId = userData.user.id;

    const { data: joueur, error: joueurError } = await supabaseAdmin
      .from("joueurs")
      .select("id, prenom, nom, email_parent, coach_id, auth_user_id")
      .eq("id", joueur_id)
      .maybeSingle();

    if (joueurError || !joueur) {
      return new Response(JSON.stringify({ error: "Joueur introuvable" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Qui appelle : le coach propriétaire, ou le joueur lui-même ?
    let role: "coach" | "joueur";
    if (joueur.coach_id === callerId) {
      role = "coach";
    } else if (joueur.auth_user_id === callerId) {
      role = "joueur";
    } else {
      return new Response(JSON.stringify({ error: "Accès refusé" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    let emailParentFinal: string;

    if (role === "joueur") {
      // Le joueur soumet (ou resoumet) l'email de son parent, et donne
      // son propre consentement au même moment (double consentement).
      if (!email_parent || typeof email_parent !== "string" || !email_parent.includes("@")) {
        return new Response(JSON.stringify({ error: "Email parent invalide" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      emailParentFinal = email_parent.trim();

      const { error: updateError } = await supabaseAdmin
        .from("joueurs")
        .update({ email_parent: emailParentFinal })
        .eq("id", joueur_id);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: "Échec d'enregistrement de l'email", detail: updateError.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      // Enregistrement du consentement du JOUEUR (partie 'joueur'), pour
      // les deux finalités -- distinct du consentement du parent qui
      // arrivera plus tard via le lien email.
      for (const type of ["acces_service", "captation_image"]) {
        await supabaseAdmin.from("consentements").insert({
          joueur_id,
          type_consentement: type,
          partie: "joueur",
          action: "accepte",
          version_texte: "v1",
          methode_verification: "case_a_cocher_app",
          token_hash: "",
        });

        await supabaseAdmin.rpc("appliquer_consentement", {
          p_joueur_id: joueur_id,
          p_type: type,
          p_partie: "joueur",
          p_action: "accepte",
          p_version_texte: "v1",
          p_methode_verification: "case_a_cocher_app",
          p_token_hash: "",
        });
      }
    } else {
      // Le coach déclenche un (re)envoi -- l'email doit déjà exister.
      if (!joueur.email_parent) {
        return new Response(JSON.stringify({ error: "Aucun email parent renseigné pour ce joueur" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      emailParentFinal = joueur.email_parent;
    }

    const { data: coach } = await supabaseAdmin
      .from("coaches")
      .select("email")
      .eq("id", joueur.coach_id)
      .maybeSingle();

    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

    const { error: insertTokenError } = await supabaseAdmin
      .from("jetons_consentement_parental")
      .insert({ joueur_id, token });

    if (insertTokenError) {
      return new Response(
        JSON.stringify({ error: "Échec de création du jeton", detail: insertTokenError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const lienConsentement =
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/confirmer-consentement-parental?token=${token}`;

    const reponseResend = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev",
        to: emailParentFinal,
        subject: `Demande de consentement pour ${joueur.prenom}`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
            <h2>Demande de consentement</h2>
            <p>Bonjour,</p>
            <p>
              Le coach <b>${coach?.email ?? "votre coach"}</b> souhaite inscrire
              <b>${joueur.prenom} ${joueur.nom ?? ""}</b> sur son application de suivi
              d'entraînement basket.
            </p>
            <p>
              Conformément au RGPD, votre accord est nécessaire avant que ${joueur.prenom}
              puisse utiliser le service.
            </p>
            <p style="margin: 32px 0;">
              <a href="${lienConsentement}"
                 style="background:#EA580C;color:white;padding:12px 24px;
                        border-radius:8px;text-decoration:none;font-weight:bold;">
                Donner mon accord
              </a>
            </p>
            <p style="color:#666;font-size:13px;">
              Ce lien est valable 7 jours. Si vous n'êtes pas à l'origine de cette
              demande, vous pouvez ignorer cet email.
            </p>
          </div>
        `,
      }),
    });

    if (!reponseResend.ok) {
      const detailResend = await reponseResend.text();
      return new Response(
        JSON.stringify({ error: "Échec de l'envoi de l'email", detail: detailResend }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ succes: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erreur envoyer-consentement-parental:", err);
    return new Response(JSON.stringify({ error: "Erreur serveur", detail: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});