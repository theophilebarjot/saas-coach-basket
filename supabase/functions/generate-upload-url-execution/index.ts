// supabase/functions/generate-upload-url-execution/index.ts

import { createClient } from "npm:@supabase/supabase-js@2";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3@3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3";

const EXTENSIONS_AUTORISEES = ["mp4", "mov", "m4v"];

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Méthode non autorisée" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // ---- 1. Lecture et validation du corps de la requête ----
    const { seance_exercice_id, file_extension } = await req.json();

    if (!seance_exercice_id || typeof seance_exercice_id !== "string") {
      return new Response(
        JSON.stringify({ error: "seance_exercice_id manquant" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const extension = (file_extension || "mp4").toLowerCase();
    if (!EXTENSIONS_AUTORISEES.includes(extension)) {
      return new Response(
        JSON.stringify({ error: `Extension non autorisée : ${extension}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ---- 2. Authentification : qui appelle ? (le joueur) ----
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

    // ---- 3. Résolution du profil joueur et vérification d'accès ----
    const { data: joueur, error: joueurError } = await supabaseAdmin
      .from("joueurs")
      .select("id, statut_acces_service")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();

    if (joueurError || !joueur) {
      return new Response(JSON.stringify({ error: "Profil joueur introuvable" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (joueur.statut_acces_service !== "actif") {
      return new Response(
        JSON.stringify({ error: "Accès non activé (consentement parental en attente)" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // ---- 4. Vérification de propriété : cet exercice de séance
    //          appartient-il bien à une séance de CE joueur ? ----
    const { data: seanceExercice, error: seError } = await supabaseAdmin
      .from("seances_exercices")
      .select(`
        id,
        seances ( id, joueur_id )
      `)
      .eq("id", seance_exercice_id)
      .maybeSingle();

    if (seError || !seanceExercice) {
      return new Response(
        JSON.stringify({ error: "Exercice de séance introuvable" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // @ts-ignore -- structure imbriquée typée dynamiquement par le client Supabase
    const joueurIdDeLaSeance = seanceExercice.seances?.joueur_id;

    if (joueurIdDeLaSeance !== joueur.id) {
      return new Response(JSON.stringify({ error: "Accès refusé" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ---- 5. Création de la ligne "videos" en attente ----
    const objectKey = `execution/${joueur.id}/${seance_exercice_id}/${crypto.randomUUID()}.${extension}`;

    const { data: video, error: videoError } = await supabaseAdmin
      .from("videos")
      .insert({
        type: "execution",
        uploaded_by_type: "joueur",
        uploaded_by_joueur_id: joueur.id,
        statut_upload: "en_attente",
        url_storage: objectKey,
      })
      .select("id")
      .single();

    if (videoError || !video) {
      return new Response(
        JSON.stringify({ error: "Échec de création de la vidéo", detail: videoError?.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // ---- 6. Rattachement à une soumission (réutilise une soumission
    //          non-validée existante, sinon en crée une) ----
    const { data: soumissionExistante } = await supabaseAdmin
      .from("soumissions")
      .select("id, statut")
      .eq("seance_exercice_id", seance_exercice_id)
      .eq("joueur_id", joueur.id)
      .neq("statut", "validee")
      .maybeSingle();

    let soumissionId: string;

    if (soumissionExistante) {
      const { error: majError } = await supabaseAdmin
        .from("soumissions")
        .update({
          video_id: video.id,
          statut: "en_attente",
          date_soumission: new Date().toISOString(),
        })
        .eq("id", soumissionExistante.id);

      if (majError) {
        return new Response(
          JSON.stringify({ error: "Échec de mise à jour de la soumission", detail: majError.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
      soumissionId = soumissionExistante.id;
    } else {
      const { data: nouvelleSoumission, error: creationError } = await supabaseAdmin
        .from("soumissions")
        .insert({
          seance_exercice_id,
          joueur_id: joueur.id,
          video_id: video.id,
          type_validation: "video",
          statut: "en_attente",
        })
        .select("id")
        .single();

      if (creationError || !nouvelleSoumission) {
        return new Response(
          JSON.stringify({ error: "Échec de création de la soumission", detail: creationError?.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
      soumissionId = nouvelleSoumission.id;
    }

    // ---- 7. Génération de l'URL signée vers R2 ----
    const accountId = Deno.env.get("R2_ACCOUNT_ID")!;
    const bucketName = Deno.env.get("R2_BUCKET_NAME")!;

    const s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
        secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ContentType: `video/${extension === "mov" ? "quicktime" : "mp4"}`,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 300,
    });

    return new Response(
      JSON.stringify({ uploadUrl, videoId: video.id, soumissionId, objectKey }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Erreur generate-upload-url-execution:", err);
    return new Response(
      JSON.stringify({ error: "Erreur serveur", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});