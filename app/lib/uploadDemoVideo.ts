// lib/uploadDemoVideo.ts

import { supabase } from './supabase';

type ResultatUpload = { succes: true; videoId: string } | { succes: false; erreur: string };

export async function uploaderVideoDemo(
  exerciceId: string,
  uriFichier: string,
  extension: string
): Promise<ResultatUpload> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { succes: false, erreur: 'Vous devez être connecté.' };
  }

  const reponseFn = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-upload-url`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ exercice_id: exerciceId, file_extension: extension }),
    }
  );

  if (!reponseFn.ok) {
    const detail = await reponseFn.json().catch(() => ({}));
    return { succes: false, erreur: detail.error ?? `Erreur serveur (${reponseFn.status})` };
  }

  const { uploadUrl, videoId } = await reponseFn.json();

  const reponseFichier = await fetch(uriFichier);
  const blobVideo = await reponseFichier.blob();

  const reponseUpload = await fetch(uploadUrl, {
    method: 'PUT',
    body: blobVideo,
    headers: {
      'Content-Type': extension === 'mov' ? 'video/quicktime' : 'video/mp4',
    },
  });

if (!reponseUpload.ok) {
    const detailErreur = await reponseUpload.text().catch(() => '(pas de détail)');
    await supabase.from('videos').update({ statut_upload: 'echec' }).eq('id', videoId);
    return {
      succes: false,
      erreur: `Échec (${reponseUpload.status}) : ${detailErreur}`,
    };
  }

  const { error: erreurMaj } = await supabase
    .from('videos')
    .update({ statut_upload: 'termine' })
    .eq('id', videoId);

  if (erreurMaj) {
    return { succes: false, erreur: 'Vidéo envoyée mais statut non confirmé : ' + erreurMaj.message };
  }

  return { succes: true, videoId };
}