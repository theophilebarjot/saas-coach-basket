// supabase/functions/get-demo-video-url/index.ts

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
    const { video_id } = await req.json();
    if (!video_id || typeof video_id !== "string") {
      return new Response(JSON.stringify({ error: "video_id manquant" }), {
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

    // Contrairement à generate-upload-url, on ne vérifie pas la propriété --
    // les vidéos de démo sont pédagogiques et lisibles par tout utilisateur
    // connecté (même règle que la policy RLS "tout_le_monde_lit_les_demos").
    const { data: video, error: videoError } = await supabaseAdmin
      .from("videos")
      .select("id, url_storage, type, statut_upload")
      .eq("id", video_id)
      .maybeSingle();

    if (videoError || !video) {
      return new Response(JSON.stringify({ error: "Vidéo introuvable" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (video.type !== "demo" || video.statut_upload !== "termine") {
      return new Response(JSON.stringify({ error: "Vidéo non disponible" }), {
        status: 403,
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

    // 10 minutes -- assez pour ouvrir et regarder une démo, sans laisser
    // un lien de visionnage exploitable indéfiniment.
    const viewUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 });

    return new Response(JSON.stringify({ viewUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erreur get-demo-video-url:", err);
    return new Response(JSON.stringify({ error: "Erreur serveur", detail: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});