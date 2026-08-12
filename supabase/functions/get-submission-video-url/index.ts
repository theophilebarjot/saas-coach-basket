// supabase/functions/get-submission-video-url/index.ts

import { createClient } from "npm:@supabase/supabase-js@2";
import { S3Client, GetObjectCommand } from "npm:@aws-sdk/client-s3@3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Méthode non autorisée" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { soumission_id } = await req.json();

    if (!soumission_id || typeof soumission_id !== "string") {
      return new Response(JSON.stringify({ error: "soumission_id manquant" }), {
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

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(jwt);

    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Token invalide" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const appelantId = userData.user.id;

    // ---- Vérification de propriété : le joueur concerné par cette
    //      soumission, ET son coach, sont tous les deux inclus dans
    //      la sélection pour pouvoir accepter l'un ou l'autre appelant. ----
    const { data: soumission, error: soumissionError } = await supabaseAdmin
      .from("soumissions")
      .select(`
        id,
        video_id,
        joueurs ( auth_user_id, coach_id )
      `)
      .eq("id", soumission_id)
      .maybeSingle();

    if (soumissionError || !soumission) {
      return new Response(JSON.stringify({ error: "Soumission introuvable" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // @ts-ignore -- structure imbriquée typée dynamiquement par le client Supabase
    const joueurAuthUserId = soumission.joueurs?.auth_user_id;
    // @ts-ignore
    const coachId = soumission.joueurs?.coach_id;

    const estLeJoueurProprietaire = appelantId === joueurAuthUserId;
    const estLeCoach = appelantId === coachId;

    if (!estLeJoueurProprietaire && !estLeCoach) {
      return new Response(JSON.stringify({ error: "Accès refusé" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!soumission.video_id) {
      return new Response(JSON.stringify({ error: "Pas de vidéo associée" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: video, error: videoError } = await supabaseAdmin
      .from("videos")
      .select("url_storage")
      .eq("id", soumission.video_id)
      .maybeSingle();

    if (videoError || !video?.url_storage) {
      return new Response(JSON.stringify({ error: "Vidéo introuvable" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

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

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: video.url_storage,
    });

    const viewUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 });

    return new Response(JSON.stringify({ viewUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erreur get-submission-video-url:", err);
    return new Response(
      JSON.stringify({ error: "Erreur serveur", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});