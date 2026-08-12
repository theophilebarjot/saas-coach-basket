// lib/uploadFeedbackAudio.ts

import { supabase } from './supabase';

export async function uploaderFeedbackAudio(
  soumissionId: string,
  uriFichier: string
): Promise<{ succes: true } | { succes: false; erreur: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { succes: false, erreur: 'Vous devez être connecté.' };
    }

    const reponseFn = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-upload-url-feedback-audio`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ soumission_id: soumissionId }),
      }
    );

    if (!reponseFn.ok) {
      const detail = await reponseFn.json().catch(() => ({}));
      return { succes: false, erreur: detail.error ?? "Échec de préparation de l'envoi." };
    }

    const { uploadUrl, objectKey } = await reponseFn.json();

    const reponseFichier = await fetch(uriFichier);
    const blobAudio = await reponseFichier.blob();

    const reponseUpload = await fetch(uploadUrl, {
      method: 'PUT',
      body: blobAudio,
      headers: { 'Content-Type': 'audio/m4a' },
    });

    if (!reponseUpload.ok) {
      return { succes: false, erreur: "Échec de l'envoi vers le stockage." };
    }

    const { error: erreurInsert } = await supabase.from('feedbacks').insert({
      soumission_id: soumissionId,
      coach_id: session.user.id,
      type: 'audio',
      url_audio: objectKey,
    });

    if (erreurInsert) {
      return { succes: false, erreur: "Audio envoyé mais feedback non enregistré : " + erreurInsert.message };
    }

    return { succes: true };
  } catch (err) {
    return { succes: false, erreur: 'Erreur inattendue : ' + String(err) };
  }
}

export async function obtenirUrlEcouteFeedback(feedbackId: string): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const reponse = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/get-feedback-audio-url`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ feedback_id: feedbackId }),
    }
  );

  if (!reponse.ok) return null;
  const { viewUrl } = await reponse.json();
  return viewUrl ?? null;
}