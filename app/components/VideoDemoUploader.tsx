// components/VideoDemoUploader.tsx

import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploaderVideoDemo } from '../lib/uploadDemoVideo';

export default function VideoDemoUploader({
  exerciceId,
  aDejaUneVideo,
  onUploadReussi,
}: {
  exerciceId: string;
  aDejaUneVideo: boolean;
  onUploadReussi: () => void;
}) {
  const [enCours, setEnCours] = useState(false);

  async function choisirDepuisLaPellicule() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', "Accès à la pellicule nécessaire pour choisir une vidéo.");
      return;
    }
    const resultat = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
    });
    if (!resultat.canceled && resultat.assets[0]) {
      await lancerUpload(resultat.assets[0].uri);
    }
  }

  async function filmerDirectement() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'Accès à la caméra nécessaire pour filmer.');
      return;
    }
    const resultat = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
      videoMaxDuration: 60,
    });
    if (!resultat.canceled && resultat.assets[0]) {
      await lancerUpload(resultat.assets[0].uri);
    }
  }

  async function lancerUpload(uri: string) {
    setEnCours(true);
    const extension = uri.split('.').pop()?.toLowerCase() ?? 'mp4';
    const resultat = await uploaderVideoDemo(exerciceId, uri, extension);
    setEnCours(false);

    if (resultat.succes) {
      onUploadReussi();
    } else {
      Alert.alert("Échec de l'envoi", resultat.erreur);
    }
  }

  if (enCours) {
    return (
      <View style={styles.conteneur}>
        <ActivityIndicator size="small" />
        <Text style={styles.texteEnCours}>Envoi...</Text>
      </View>
    );
  }

  return (
    <View style={styles.conteneur}>
      <TouchableOpacity style={styles.bouton} onPress={choisirDepuisLaPellicule}>
        <Text style={styles.texteBouton}>{aDejaUneVideo ? 'Remplacer' : '+ Démo'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.boutonSecondaire} onPress={filmerDirectement}>
        <Text style={styles.texteBoutonSecondaire}>Filmer</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: { flexDirection: 'row', gap: 6, marginLeft: 6 },
  bouton: { backgroundColor: '#2563eb', paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6 },
  texteBouton: { color: 'white', fontSize: 11, fontWeight: '600' },
  boutonSecondaire: { paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: '#2563eb' },
  texteBoutonSecondaire: { color: '#2563eb', fontSize: 11, fontWeight: '600' },
  texteEnCours: { fontSize: 11, color: '#666' },
});