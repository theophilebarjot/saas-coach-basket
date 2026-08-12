// components/LecteurFeedbackAudio.tsx

import { useEffect, useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { obtenirUrlEcouteFeedback } from '../lib/uploadFeedbackAudio';

export default function LecteurFeedbackAudio({ feedbackId }: { feedbackId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const player = useAudioPlayer(url ?? undefined);
  const status = useAudioPlayerStatus(player);

  // Force la sortie audio sur le haut-parleur principal plutôt que le petit
  // haut-parleur d'appel (beaucoup plus faible) -- sans ça, iOS route par
  // défaut vers l'écouteur téléphonique dès qu'une app touche à l'audio.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldRouteThroughEarpiece: false });
  }, []);

  // Dès que l'URL signée est disponible, on lance la lecture automatiquement
  // -- évite un double-tap "charger" puis "jouer" pour l'utilisateur.
  useEffect(() => {
    if (url) player.play();
  }, [url]);

  async function toggleLecture() {
    if (!url) {
      setChargement(true);
      const urlRecuperee = await obtenirUrlEcouteFeedback(feedbackId);
      setChargement(false);
      if (urlRecuperee) setUrl(urlRecuperee);
      return;
    }
    if (status.playing) {
      player.pause();
    } else {
      player.seekTo(0);
      player.play();
    }
  }

  return (
    <TouchableOpacity style={styles.bouton} onPress={toggleLecture} disabled={chargement}>
      {chargement ? (
        <ActivityIndicator size="small" color="#EA580C" />
      ) : (
        <Text style={styles.texte}>{status.playing ? '⏸ Pause' : '🔊 Écouter le message'}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bouton: {
    alignSelf: 'flex-start', backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#EA580C',
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, marginTop: 6,
  },
  texte: { color: '#EA580C', fontSize: 13, fontWeight: '600' },
});