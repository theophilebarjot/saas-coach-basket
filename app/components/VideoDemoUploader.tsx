// components/VideoDemoUploader.tsx

import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploaderVideoDemo, obtenirUrlVisionnageDemo } from '../lib/uploadDemoVideo';

type Etat = 'inactif' | 'en_cours' | 'echec';

export default function VideoDemoUploader({
  exerciceId,
  videoTerminee,
  videoId,
  onUploadReussi,
}: {
  exerciceId: string;
  videoTerminee: boolean;
  videoId: string | null;
  onUploadReussi: () => void;
}) {
  const [etat, setEtat] = useState<Etat>('inactif');
  const [tentativeActuelle, setTentativeActuelle] = useState<{ numero: number; max: number } | null>(null);
  const [dernierUri, setDernierUri] = useState<string | null>(null);
  const [dernierMessageErreur, setDernierMessageErreur] = useState<string | null>(null);
  const [chargementLecture, setChargementLecture] = useState(false);

  async function voirLaVideo() {
    if (!videoId) return;
    setChargementLecture(true);
    const url = await obtenirUrlVisionnageDemo(videoId);
    setChargementLecture(false);
    if (!url) {
      Alert.alert('Erreur', "Impossible de charger la vidéo pour l'instant.");
      return;
    }
    Linking.openURL(url);
  }

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
    setDernierUri(uri);
    setEtat('en_cours');
    setDernierMessageErreur(null);
    const extension = uri.split('.').pop()?.toLowerCase() ?? 'mp4';

    try {
      const resultat = await uploaderVideoDemo(exerciceId, uri, extension, (numero, max) => {
        setTentativeActuelle({ numero, max });
      });

      setTentativeActuelle(null);

      if (resultat.succes) {
        setEtat('inactif');
        onUploadReussi();
      } else {
        setEtat('echec');
        setDernierMessageErreur(resultat.erreur);
        if (!resultat.peutReessayer) {
          Alert.alert("Échec de l'envoi", resultat.erreur);
        }
      }
    } catch (erreurInattendue) {
      setTentativeActuelle(null);
      setEtat('echec');
      setDernierMessageErreur(String(erreurInattendue));
    }
  }

  function reessayer() {
    if (dernierUri) lancerUpload(dernierUri);
  }

  if (etat === 'en_cours') {
    return (
      <View style={styles.conteneur}>
        <ActivityIndicator size="small" />
        <Text style={styles.texteEnCours}>
          {tentativeActuelle && tentativeActuelle.max > 1
            ? `Envoi... (essai ${tentativeActuelle.numero}/${tentativeActuelle.max})`
            : 'Envoi...'}
        </Text>
      </View>
    );
  }

  if (etat === 'echec') {
    return (
      <View style={styles.conteneurEchec}>
        <Text style={styles.texteErreur} numberOfLines={2}>
          {dernierMessageErreur ?? "Échec de l'envoi"}
        </Text>
        <TouchableOpacity style={styles.boutonReessayer} onPress={reessayer}>
          <Text style={styles.texteBouton}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.conteneur}>
      {videoTerminee && (
        <TouchableOpacity style={styles.boutonVoir} onPress={voirLaVideo} disabled={chargementLecture}>
          {chargementLecture ? (
            <ActivityIndicator size="small" color="#16A34A" />
          ) : (
            <Text style={styles.texteVoir}>✓ Voir</Text>
          )}
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.bouton} onPress={choisirDepuisLaPellicule}>
        <Text style={styles.texteBouton}>{videoTerminee ? 'Remplacer' : '+ Démo'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.boutonSecondaire} onPress={filmerDirectement}>
        <Text style={styles.texteBoutonSecondaire}>Filmer</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 6, flex: 1 },
  conteneurEchec: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 6, flex: 1 },
  bouton: { backgroundColor: '#2563eb', paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6 },
  texteBouton: { color: 'white', fontSize: 11, fontWeight: '600' },
  boutonSecondaire: { paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: '#2563eb' },
  texteBoutonSecondaire: { color: '#2563eb', fontSize: 11, fontWeight: '600' },
  texteEnCours: { fontSize: 11, color: '#666' },
  boutonReessayer: { backgroundColor: '#DC2626', paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6 },
  texteErreur: { fontSize: 10, color: '#DC2626', flexShrink: 1 },
  boutonVoir: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#16A34A', paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6 },
  texteVoir: { color: '#16A34A', fontSize: 11, fontWeight: '600' },
});