// supabase/functions/generate-upload-url/index.ts

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
    const { exercice_id, file_extension } = await req.json();

    if (!exercice_id || typeof exercice_id !== "string") {
      return new Response(JSON.stringify({ error: "exercice_id manquant" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const extension = (file_extension || "mp4").toLowerCase();
    if (!EXTENSIONS_AUTORISEES.includes(extension)) {
      return new Response(
        JSON.stringify({ error: `Extension non autorisée : ${extension}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ---- 2. Authentification : qui appelle ? ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const jwt = authHeader.replace("Bearer ", "");

    // Client admin : seul lui a le droit de contourner les RLS,
    // et uniquement pour la vérification de propriété et l'écriture finale.
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

    const coachId = userData.user.id;

    // ---- 3. Vérification de propriété : cet exercice appartient-il
    //          bien à un skill tree de ce coach ? ----
    const { data: exercice, error: exerciceError } = await supabaseAdmin
      .from("exercices")
      .select(
        `
        id,
        briques (
          id,
          piliers (
            id,
            skill_trees ( id, coach_id )
          )
        )
      `
      )
      .eq("id", exercice_id)
      .maybeSingle();

    if (exerciceError || !exercice) {
      return new Response(JSON.stringify({ error: "Exercice introuvable" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // @ts-ignore -- structure imbriquée typée dynamiquement par le client Supabase
    const skillTreeCoachId = exercice.briques?.piliers?.skill_trees?.coach_id;

    if (skillTreeCoachId !== coachId) {
      return new Response(JSON.stringify({ error: "Accès refusé" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ---- 4. Création de la ligne "videos" en attente ----
    const objectKey = `demo/${coachId}/${exercice_id}/${crypto.randomUUID()}.${extension}`;

    const { data: video, error: videoError } = await supabaseAdmin
      .from("videos")
      .insert({
        type: "demo",
        uploaded_by_type: "coach",
        uploaded_by_coach_id: coachId,
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

    // ---- 5. Rattachement immédiat à l'exercice ----
    const { error: updateError } = await supabaseAdmin
      .from("exercices")
      .update({ video_demo_id: video.id })
      .eq("id", exercice_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Échec de rattachement", detail: updateError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // ---- 6. Génération de l'URL signée vers R2 ----
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
      expiresIn: 300, // 5 minutes, usage unique
    });

    return new Response(
      JSON.stringify({ uploadUrl, videoId: video.id, objectKey }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Erreur generate-upload-url:", err);
    return new Response(
      JSON.stringify({ error: "Erreur serveur", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});