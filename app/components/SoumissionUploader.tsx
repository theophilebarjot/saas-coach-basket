// components/SoumissionUploader.tsx

import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploaderVideoSoumission, obtenirUrlVisionnageSoumission } from '../lib/uploadSoumissionVideo';

type Etat = 'inactif' | 'en_cours' | 'echec';

type SoumissionInfo = {
  id: string;
  statut: string; // 'en_attente' | 'validee' | 'refusee'
  statutUpload: string | null; // statut_upload de la vidéo liée, si elle existe
} | null;

export default function SoumissionUploader({
  seanceExerciceId,
  soumission,
  onUploadReussi,
}: {
  seanceExerciceId: string;
  soumission: SoumissionInfo;
  onUploadReussi: () => void;
}) {
  const [etat, setEtat] = useState<Etat>('inactif');
  const [tentativeActuelle, setTentativeActuelle] = useState<{ numero: number; max: number } | null>(null);
  const [dernierUri, setDernierUri] = useState<string | null>(null);
  const [dernierMessageErreur, setDernierMessageErreur] = useState<string | null>(null);
  const [chargementLecture, setChargementLecture] = useState(false);

  const videoDisponible = soumission?.statutUpload === 'termine';

  async function voirLaVideo() {
    if (!soumission) return;
    setChargementLecture(true);
    const url = await obtenirUrlVisionnageSoumission(soumission.id);
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
      const resultat = await uploaderVideoSoumission(seanceExerciceId, uri, extension, (numero, max) => {
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
        <ActivityIndicator size="small" color="#EA580C" />
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

  // Soumission validée par le coach : on fige, plus de ré-upload possible.
  if (soumission?.statut === 'validee') {
    return (
      <View style={styles.conteneur}>
        <View style={styles.badgeValide}>
          <Text style={styles.texteValide}>✓ Validé</Text>
        </View>
        {videoDisponible && (
          <TouchableOpacity style={styles.boutonVoir} onPress={voirLaVideo} disabled={chargementLecture}>
            {chargementLecture ? (
              <ActivityIndicator size="small" color="#16A34A" />
            ) : (
              <Text style={styles.texteVoir}>Voir</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const refusee = soumission?.statut === 'refusee';

  return (
    <View style={styles.conteneur}>
      {refusee && (
        <View style={styles.badgeRefuse}>
          <Text style={styles.texteRefuse}>À corriger</Text>
        </View>
      )}
      {!refusee && videoDisponible && (
        <View style={styles.badgeAttente}>
          <Text style={styles.texteAttente}>En attente</Text>
        </View>
      )}
      {videoDisponible && (
        <TouchableOpacity style={styles.boutonVoir} onPress={voirLaVideo} disabled={chargementLecture}>
          {chargementLecture ? (
            <ActivityIndicator size="small" color="#16A34A" />
          ) : (
            <Text style={styles.texteVoir}>Voir</Text>
          )}
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.bouton} onPress={choisirDepuisLaPellicule}>
        <Text style={styles.texteBouton}>{videoDisponible ? 'Remplacer' : '+ Vidéo'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.boutonSecondaire} onPress={filmerDirectement}>
        <Text style={styles.texteBoutonSecondaire}>Filmer</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 },
  conteneurEchec: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  bouton: { backgroundColor: '#EA580C', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 },
  texteBouton: { color: 'white', fontSize: 12, fontWeight: '600' },
  boutonSecondaire: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: '#EA580C' },
  texteBoutonSecondaire: { color: '#EA580C', fontSize: 12, fontWeight: '600' },
  texteEnCours: { fontSize: 12, color: '#78716C' },
  boutonReessayer: { backgroundColor: '#DC2626', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 },
  texteErreur: { fontSize: 11, color: '#DC2626', flexShrink: 1 },
  boutonVoir: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#16A34A', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 },
  texteVoir: { color: '#16A34A', fontSize: 12, fontWeight: '600' },
  badgeValide: { backgroundColor: '#DCFCE7', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6 },
  texteValide: { color: '#16A34A', fontSize: 12, fontWeight: '700' },
  badgeRefuse: { backgroundColor: '#FEE2E2', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6 },
  texteRefuse: { color: '#DC2626', fontSize: 12, fontWeight: '700' },
  badgeAttente: { backgroundColor: '#FEF3C7', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6 },
  texteAttente: { color: '#92400E', fontSize: 12, fontWeight: '600' },
});