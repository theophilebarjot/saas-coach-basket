// supabase/functions/generate-upload-url-feedback-audio/index.ts

import { createClient } from "npm:@supabase/supabase-js@2";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3@3";
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
    if (!soumission_id) {
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

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Token invalide" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const coachId = userData.user.id;

    // ---- Vérification de propriété : ce coach gère-t-il bien le joueur
    //      concerné par cette soumission ? ----
    const { data: soumission, error: soumissionError } = await supabaseAdmin
      .from("soumissions")
      .select("id, joueurs ( coach_id )")
      .eq("id", soumission_id)
      .maybeSingle();

    if (soumissionError || !soumission) {
      return new Response(JSON.stringify({ error: "Soumission introuvable" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // @ts-ignore
    const coachIdDuJoueur = soumission.joueurs?.coach_id;
    if (coachIdDuJoueur !== coachId) {
      return new Response(JSON.stringify({ error: "Accès refusé" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const objectKey = `feedback-audio/${coachId}/${soumission_id}/${crypto.randomUUID()}.m4a`;

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
      ContentType: "audio/m4a",
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    return new Response(JSON.stringify({ uploadUrl, objectKey }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erreur generate-upload-url-feedback-audio:", err);
    return new Response(JSON.stringify({ error: "Erreur serveur", detail: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});