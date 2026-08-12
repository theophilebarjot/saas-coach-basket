// components/DetailBriqueJoueur.tsx

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, TouchableOpacity, Linking } from 'react-native';
import { supabase } from '../lib/supabase';
import { obtenirUrlVisionnageDemo } from '../lib/uploadDemoVideo';

type Exercice = {
  id: string;
  nom: string;
  description: string | null;
  niveau: string | null;
  video_demo_id: string | null;
};

const ORDRE_NIVEAUX = ['debutant', 'intermediaire', 'avance'];
const LABELS_NIVEAUX: Record<string, string> = {
  debutant: 'Débutant',
  intermediaire: 'Intermédiaire',
  avance: 'Avancé',
};

export default function DetailBriqueJoueur({
  briqueId,
  briqueNom,
  onBack,
}: {
  briqueId: string;
  briqueNom: string;
  onBack: () => void;
}) {
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [loading, setLoading] = useState(true);
  const [chargementVideoId, setChargementVideoId] = useState<string | null>(null);

  async function chargerExercices() {
    setLoading(true);
    const { data, error } = await supabase
      .from('exercices')
      .select('id, nom, description, niveau, video_demo_id')
      .eq('brique_id', briqueId);

    if (error) {
      Alert.alert('Erreur', error.message);
      setLoading(false);
      return;
    }

    const tries = ((data ?? []) as Exercice[]).sort((a, b) => {
      const ia = a.niveau ? ORDRE_NIVEAUX.indexOf(a.niveau) : 99;
      const ib = b.niveau ? ORDRE_NIVEAUX.indexOf(b.niveau) : 99;
      return ia - ib;
    });

    setExercices(tries);
    setLoading(false);
  }

  useEffect(() => {
    chargerExercices();
  }, [briqueId]);

  async function voirLaDemo(videoDemoId: string) {
    setChargementVideoId(videoDemoId);
    const url = await obtenirUrlVisionnageDemo(videoDemoId);
    setChargementVideoId(null);
    if (!url) {
      Alert.alert('Erreur', "Impossible de charger la vidéo pour l'instant.");
      return;
    }
    Linking.openURL(url);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#EA580C" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.backLink}>← Retour à l'arbre</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{briqueNom}</Text>

      <ScrollView style={styles.scroll}>
        {exercices.length === 0 && (
          <Text style={styles.empty}>Ton coach n'a pas encore ajouté d'exercice ici.</Text>
        )}

        {exercices.map((ex) => (
          <View key={ex.id} style={styles.carte}>
            <View style={styles.entete}>
              {ex.niveau && (
                <Text style={styles.badgeNiveau}>{LABELS_NIVEAUX[ex.niveau] ?? ex.niveau}</Text>
              )}
              <Text style={styles.exerciceNom}>{ex.nom}</Text>
            </View>

            {ex.description && <Text style={styles.description}>{ex.description}</Text>}

            {ex.video_demo_id && (
              <TouchableOpacity
                style={styles.boutonVoir}
                onPress={() => voirLaDemo(ex.video_demo_id!)}
                disabled={chargementVideoId === ex.video_demo_id}
              >
                {chargementVideoId === ex.video_demo_id ? (
                  <ActivityIndicator size="small" color="#EA580C" />
                ) : (
                  <Text style={styles.texteVoir}>▶ Voir la démo</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8', padding: 20 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAF8' },
  backLink: { color: '#EA580C', fontWeight: '600', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#1C1917', marginBottom: 16 },
  scroll: { flex: 1 },
  empty: { color: '#78716C', fontStyle: 'italic' },
  carte: {
    backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E7E5E4',
    padding: 14, marginBottom: 10,
  },
  entete: { marginBottom: 6 },
  badgeNiveau: {
    fontSize: 11, fontWeight: '700', color: '#EA580C', marginBottom: 4,
    textTransform: 'uppercase',
  },
  exerciceNom: { fontSize: 15, fontWeight: '600', color: '#1C1917' },
  description: { fontSize: 13, color: '#57534E', lineHeight: 18, marginBottom: 10 },
  boutonVoir: {
    alignSelf: 'flex-start', backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#EA580C',
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8,
  },
  texteVoir: { color: '#EA580C', fontSize: 13, fontWeight: '600' },
});