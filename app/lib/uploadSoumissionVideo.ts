// lib/uploadSoumissionVideo.ts

import { supabase } from './supabase';

export async function obtenirUrlVisionnageSoumission(soumissionId: string): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const reponse = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/get-submission-video-url`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ soumission_id: soumissionId }),
    }
  );

  if (!reponse.ok) return null;
  const { viewUrl } = await reponse.json();
  return viewUrl ?? null;
}

type ResultatUpload =
  | { succes: true; soumissionId: string; videoId: string }
  | { succes: false; erreur: string; peutReessayer: boolean };

const MAX_TENTATIVES = 3;
const DELAIS_MS = [2000, 5000, 10000];
const TIMEOUT_APPEL_INITIAL_MS = 10000;

function attendre(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estUneErreurReseau(erreur: unknown): boolean {
  if (erreur instanceof TypeError) return true;
  const message = String(erreur).toLowerCase();
  return message.includes('network') || message.includes('failed to fetch') || message.includes('abort');
}

async function fetchAvecTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controleur.signal });
  } finally {
    clearTimeout(minuteur);
  }
}

async function envoyerVersR2AvecRetry(
  uploadUrl: string,
  blob: Blob,
  contentType: string,
  onTentative?: (numero: number, max: number) => void
): Promise<{ ok: true } | { ok: false; erreur: string; reseauUniquement: boolean }> {
  let derniereErreur = '';
  let toutesLesErreursSontReseau = true;

  for (let tentative = 1; tentative <= MAX_TENTATIVES; tentative++) {
    onTentative?.(tentative, MAX_TENTATIVES);
    try {
      const reponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': contentType },
      });
      if (reponse.ok) return { ok: true };

      derniereErreur = `Refusé par le stockage (${reponse.status})`;
      toutesLesErreursSontReseau = false;
      break;
    } catch (erreur) {
      if (!estUneErreurReseau(erreur)) {
        derniereErreur = String(erreur);
        toutesLesErreursSontReseau = false;
        break;
      }
      derniereErreur = "Coupure réseau pendant l'envoi";
      if (tentative < MAX_TENTATIVES) {
        await attendre(DELAIS_MS[tentative - 1]);
      }
    }
  }

  return { ok: false, erreur: derniereErreur, reseauUniquement: toutesLesErreursSontReseau };
}

export async function uploaderVideoSoumission(
  seanceExerciceId: string,
  uriFichier: string,
  extension: string,
  onTentative?: (numero: number, max: number) => void
): Promise<ResultatUpload> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { succes: false, erreur: 'Vous devez être connecté.', peutReessayer: false };
    }

    let reponseFn: Response;
    try {
      reponseFn = await fetchAvecTimeout(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-upload-url-execution`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ seance_exercice_id: seanceExerciceId, file_extension: extension }),
        },
        TIMEOUT_APPEL_INITIAL_MS
      );
    } catch (erreur) {
      return {
        succes: false,
        erreur: estUneErreurReseau(erreur)
          ? "Pas de connexion pour démarrer l'envoi."
          : 'Erreur de connexion au serveur.',
        peutReessayer: true,
      };
    }

    if (!reponseFn.ok) {
      const detail = await reponseFn.json().catch(() => ({}));
      return {
        succes: false,
        erreur: detail.error ?? `Erreur serveur (${reponseFn.status})`,
        peutReessayer: true,
      };
    }

    const { uploadUrl, videoId, soumissionId } = await reponseFn.json();

    let blobVideo: Blob;
    try {
      const reponseFichier = await fetch(uriFichier);
      blobVideo = await reponseFichier.blob();
    } catch {
      return {
        succes: false,
        erreur: 'Impossible de lire le fichier vidéo local.',
        peutReessayer: false,
      };
    }

    const contentType = extension === 'mov' ? 'video/quicktime' : 'video/mp4';
    const resultatEnvoi = await envoyerVersR2AvecRetry(uploadUrl, blobVideo, contentType, onTentative);

    if (!resultatEnvoi.ok) {
      try {
        await supabase.from('videos').update({ statut_upload: 'echec' }).eq('id', videoId);
      } catch {
        // Ignoré volontairement -- l'essentiel est de renvoyer l'erreur
        // d'upload à l'utilisateur, pas de bloquer sur cette mise à jour.
      }
      return {
        succes: false,
        erreur: resultatEnvoi.reseauUniquement
          ? `Échec après ${MAX_TENTATIVES} tentatives : connexion instable.`
          : resultatEnvoi.erreur,
        peutReessayer: true,
      };
    }

    const { error: erreurMaj } = await supabase
      .from('videos')
      .update({ statut_upload: 'termine' })
      .eq('id', videoId);

    if (erreurMaj) {
      return {
        succes: false,
        erreur: 'Vidéo envoyée mais statut non confirmé : ' + erreurMaj.message,
        peutReessayer: false,
      };
    }

    return { succes: true, soumissionId, videoId };
  } catch (erreurInattendue) {
    return {
      succes: false,
      erreur: 'Erreur inattendue : ' + String(erreurInattendue),
      peutReessayer: true,
    };
  }
}