// supabase/functions/lier-compte-joueur/index.ts

import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Méthode non autorisée" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { code_invitation } = await req.json();
    if (!code_invitation || typeof code_invitation !== "string") {
      return new Response(JSON.stringify({ error: "Code d'invitation manquant" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Le joueur vient de créer son compte : on récupère son identité via le JWT
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
    const authUserId = userData.user.id;

    // On normalise le code (majuscules, sans espaces) pour tolérer les fautes de frappe
    const codeNormalise = code_invitation.trim().toUpperCase();

    const { data: joueur, error: joueurError } = await supabaseAdmin
      .from("joueurs")
      .select("id, auth_user_id, prenom")
      .eq("code_invitation", codeNormalise)
      .maybeSingle();

    if (joueurError || !joueur) {
      return new Response(JSON.stringify({ error: "Code d'invitation invalide" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Garde-fou : la fiche ne doit pas déjà être liée à un compte
    if (joueur.auth_user_id) {
      // Si c'est DÉJÀ ce même compte, on considère que c'est bon (idempotent)
      if (joueur.auth_user_id === authUserId) {
        return new Response(JSON.stringify({ succes: true, joueur_id: joueur.id, prenom: joueur.prenom }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Ce code a déjà été utilisé par un autre compte" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Liaison : on écrit auth_user_id sur la fiche
    const { error: updateError } = await supabaseAdmin
      .from("joueurs")
      .update({ auth_user_id: authUserId })
      .eq("id", joueur.id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Échec de la liaison", detail: updateError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ succes: true, joueur_id: joueur.id, prenom: joueur.prenom }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Erreur lier-compte-joueur:", err);
    return new Response(JSON.stringify({ error: "Erreur serveur", detail: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});