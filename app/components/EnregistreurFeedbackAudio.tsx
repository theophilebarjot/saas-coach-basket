// components/EnregistreurFeedbackAudio.tsx

import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';

export default function EnregistreurFeedbackAudio({
  uri,
  onUriChange,
}: {
  uri: string | null;
  onUriChange: (uri: string | null) => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const player = useAudioPlayer(uri ?? undefined);
  const playerStatus = useAudioPlayerStatus(player);

  useEffect(() => {
  (async () => {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    if (!status.granted) {
      Alert.alert('Permission refusée', "L'accès au micro est nécessaire pour enregistrer un message vocal.");
      return;
    }
    // shouldRouteThroughEarpiece: false force la sortie sur le haut-parleur
    // principal plutôt que le petit haut-parleur d'appel (beaucoup plus faible).
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: true,
      shouldRouteThroughEarpiece: false,
    });
  })();
}, []);

  async function demarrer() {
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  async function arreter() {
    await recorder.stop();
    onUriChange(recorder.uri ?? null);
  }

  function ecouterApercu() {
    player.seekTo(0);
    player.play();
  }

  function supprimer() {
    onUriChange(null);
  }

  if (uri) {
    return (
      <View style={styles.ligne}>
        <TouchableOpacity style={styles.boutonEcouter} onPress={ecouterApercu}>
          <Text style={styles.texteEcouter}>{playerStatus.playing ? '▶ En lecture...' : '▶ Écouter'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.boutonSupprimer} onPress={supprimer}>
          <Text style={styles.texteSupprimer}>Supprimer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.boutonEnregistrer, recorderState.isRecording && styles.boutonEnregistrerActif]}
      onPress={recorderState.isRecording ? arreter : demarrer}
    >
      <Text style={styles.texteEnregistrer}>
        {recorderState.isRecording ? '⏹ Arrêter' : '🎙 Message vocal'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  ligne: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  boutonEnregistrer: {
    alignSelf: 'flex-start', backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#EA580C',
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, marginBottom: 12,
  },
  boutonEnregistrerActif: { backgroundColor: '#FEE2E2', borderColor: '#DC2626' },
  texteEnregistrer: { color: '#EA580C', fontSize: 13, fontWeight: '600' },
  boutonEcouter: {
    backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#16A34A',
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8,
  },
  texteEcouter: { color: '#16A34A', fontSize: 13, fontWeight: '600' },
  boutonSupprimer: {
    borderWidth: 1, borderColor: '#DC2626', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8,
  },
  texteSupprimer: { color: '#DC2626', fontSize: 13, fontWeight: '600' },
});