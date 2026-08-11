// supabase/functions/confirmer-consentement-parental/index.ts
// Renvoie du JSON uniquement (Supabase ne sert pas de HTML sans domaine perso) --
// la mise en page est faite par la page statique GitHub Pages qui appelle cette API.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ---------- GET : renvoyer les infos nécessaires à l'affichage ----------
  if (req.method === "GET") {
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response(JSON.stringify({ statut: "invalide" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { data: jeton } = await supabaseAdmin
      .from("jetons_consentement_parental")
      .select("id, joueur_id, expire_le, utilise_le")
      .eq("token", token)
      .maybeSingle();

    if (!jeton) {
      return new Response(JSON.stringify({ statut: "invalide" }), {
        status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    if (jeton.utilise_le) {
      return new Response(JSON.stringify({ statut: "deja_traite" }), {
        status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    if (new Date(jeton.expire_le) < new Date()) {
      return new Response(JSON.stringify({ statut: "expire" }), {
        status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { data: joueur } = await supabaseAdmin
      .from("joueurs")
      .select("prenom, nom")
      .eq("id", jeton.joueur_id)
      .maybeSingle();

    return new Response(
      JSON.stringify({ statut: "en_attente", prenom: joueur?.prenom, nom: joueur?.nom }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  // ---------- POST : enregistrer la décision ----------
  if (req.method === "POST") {
    const { token, decision } = await req.json();

    if (!token || !decision || !["accepte", "refuse"].includes(decision)) {
      return new Response(JSON.stringify({ error: "Requête invalide" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { data: jeton } = await supabaseAdmin
      .from("jetons_consentement_parental")
      .select("id, joueur_id, expire_le, utilise_le")
      .eq("token", token)
      .maybeSingle();

    if (!jeton || jeton.utilise_le || new Date(jeton.expire_le) < new Date()) {
      return new Response(JSON.stringify({ error: "Lien invalide ou expiré" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const tokenBuffer = new TextEncoder().encode(token);
    const hashBuffer = await crypto.subtle.digest("SHA-256", tokenBuffer);
    const tokenHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0")).join("");

    for (const type of ["acces_service", "captation_image"]) {
      await supabaseAdmin.from("consentements").insert({
        joueur_id: jeton.joueur_id,
        type_consentement: type,
        partie: "parent",
        action: decision,
        version_texte: "v1",
        methode_verification: "lien_email",
        token_hash: tokenHash,
      });

      await supabaseAdmin.rpc("appliquer_consentement", {
        p_joueur_id: jeton.joueur_id,
        p_type: type,
        p_partie: "parent",
        p_action: decision,
        p_version_texte: "v1",
        p_methode_verification: "lien_email",
        p_token_hash: tokenHash,
      });
    }

    await supabaseAdmin
      .from("jetons_consentement_parental")
      .update({ utilise_le: new Date().toISOString() })
      .eq("id", jeton.id);

    return new Response(JSON.stringify({ succes: true, decision }), {
      status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Méthode non autorisée" }), {
    status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});