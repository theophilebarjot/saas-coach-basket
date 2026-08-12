// supabase/functions/get-feedback-audio-url/index.ts

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
    const { feedback_id } = await req.json();
    if (!feedback_id) {
      return new Response(JSON.stringify({ error: "feedback_id manquant" }), {
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

    const appelantId = userData.user.id;

    const { data: feedback, error: feedbackError } = await supabaseAdmin
      .from("feedbacks")
      .select(`
        coach_id,
        url_audio,
        soumissions ( joueurs ( auth_user_id ) )
      `)
      .eq("id", feedback_id)
      .maybeSingle();

    if (feedbackError || !feedback) {
      return new Response(JSON.stringify({ error: "Feedback introuvable" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // @ts-ignore
    const joueurAuthUserId = feedback.soumissions?.joueurs?.auth_user_id;
    const estLeCoach = appelantId === feedback.coach_id;
    const estLeJoueurConcerne = appelantId === joueurAuthUserId;

    if (!estLeCoach && !estLeJoueurConcerne) {
      return new Response(JSON.stringify({ error: "Accès refusé" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!feedback.url_audio) {
      return new Response(JSON.stringify({ error: "Pas d'audio pour ce feedback" }), {
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

    const command = new GetObjectCommand({ Bucket: bucketName, Key: feedback.url_audio });
    const viewUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 });

    return new Response(JSON.stringify({ viewUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erreur get-feedback-audio-url:", err);
    return new Response(JSON.stringify({ error: "Erreur serveur", detail: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});