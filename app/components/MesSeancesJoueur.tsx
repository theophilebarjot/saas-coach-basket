// components/MesSeancesJoueur.tsx

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import SoumissionUploader from './SoumissionUploader';

type Exercice = { id: string; nom: string; niveau: string | null };
type SeanceExercice = { id: string; ordre: number; consignes: string | null; exercice: Exercice | null };
type Seance = {
  id: string;
  titre: string;
  date_planifiee: string | null;
  statut: string;
  exercices: SeanceExercice[];
};

type SoumissionInfo = {
  id: string;
  statut: string;
  statutUpload: string | null;
};

export default function MesSeancesJoueur({ joueurId }: { joueurId: string }) {
  const [seances, setSeances] = useState<Seance[]>([]);
  const [soumissionsParExercice, setSoumissionsParExercice] = useState<Map<string, SoumissionInfo>>(new Map());
  const [loading, setLoading] = useState(true);

  async function chargerSeances() {
    setLoading(true);

    const { data: seancesData, error: erreurSeances } = await supabase
      .from('seances')
      .select(`
        id,
        titre,
        date_planifiee,
        statut,
        seances_exercices (
          id,
          ordre,
          consignes,
          exercices ( id, nom, niveau )
        )
      `)
      .eq('joueur_id', joueurId)
      .order('date_planifiee', { ascending: true });

    if (erreurSeances) {
      Alert.alert('Erreur', erreurSeances.message);
      setLoading(false);
      return;
    }

    const seancesFormatees: Seance[] = ((seancesData ?? []) as any[]).map((s) => ({
      id: s.id,
      titre: s.titre,
      date_planifiee: s.date_planifiee,
      statut: s.statut,
      exercices: ((s.seances_exercices ?? []) as any[])
        .map((se) => ({
          id: se.id,
          ordre: se.ordre,
          consignes: se.consignes,
          // Certaines relations imbriquées reviennent en objet unique et non
          // en tableau selon le client Supabase -- on gère les deux cas.
          exercice: Array.isArray(se.exercices) ? se.exercices[0] ?? null : se.exercices ?? null,
        }))
        .sort((a, b) => a.ordre - b.ordre),
    }));

    setSeances(seancesFormatees);

    // ---- Récupère les soumissions déjà existantes pour ces exercices ----
    const tousLesSeanceExerciceIds = seancesFormatees.flatMap((s) => s.exercices.map((e) => e.id));

    if (tousLesSeanceExerciceIds.length > 0) {
      const { data: soumissionsData, error: erreurSoumissions } = await supabase
        .from('soumissions')
        .select('id, seance_exercice_id, statut, videos ( statut_upload )')
        .eq('joueur_id', joueurId)
        .in('seance_exercice_id', tousLesSeanceExerciceIds);

      if (!erreurSoumissions) {
        const map = new Map<string, SoumissionInfo>();
        ((soumissionsData ?? []) as any[]).forEach((s) => {
          // Là aussi, "videos" peut revenir en objet unique plutôt qu'en tableau.
          const video = Array.isArray(s.videos) ? s.videos[0] : s.videos;
          map.set(s.seance_exercice_id, {
            id: s.id,
            statut: s.statut,
            statutUpload: video?.statut_upload ?? null,
          });
        });
        setSoumissionsParExercice(map);
      }
    } else {
      setSoumissionsParExercice(new Map());
    }

    setLoading(false);
  }

  useEffect(() => {
    chargerSeances();
  }, [joueurId]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#EA580C" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mes séances</Text>

      <ScrollView style={styles.scroll}>
        {seances.length === 0 && (
          <Text style={styles.empty}>Ton coach ne t'a pas encore programmé de séance.</Text>
        )}

        {seances.map((seance) => (
          <View key={seance.id} style={styles.seanceBloc}>
            <View style={styles.seanceEntete}>
              <Text style={styles.seanceTitre}>{seance.titre}</Text>
              {seance.date_planifiee && (
                <Text style={styles.seanceDate}>{seance.date_planifiee}</Text>
              )}
            </View>

            {seance.exercices.length === 0 ? (
              <Text style={styles.emptyExercices}>Aucun exercice dans cette séance.</Text>
            ) : (
              seance.exercices.map((se) => (
                <View key={se.id} style={styles.exerciceRow}>
                  <View style={styles.exerciceInfo}>
                    <Text style={styles.exerciceNom}>{se.exercice?.nom ?? 'Exercice'}</Text>
                    {se.exercice?.niveau && (
                      <Text style={styles.exerciceNiveau}>{se.exercice.niveau}</Text>
                    )}
                    {se.consignes && <Text style={styles.consignes}>{se.consignes}</Text>}
                  </View>
                  <SoumissionUploader
                    seanceExerciceId={se.id}
                    soumission={soumissionsParExercice.get(se.id) ?? null}
                    onUploadReussi={chargerSeances}
                  />
                </View>
              ))
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAF8' },
  title: { fontSize: 20, fontWeight: '700', color: '#1C1917', padding: 20, paddingBottom: 8 },
  scroll: { flex: 1, paddingHorizontal: 20 },
  empty: { color: '#78716C', fontStyle: 'italic' },
  seanceBloc: {
    marginBottom: 20, backgroundColor: '#FFFFFF', borderRadius: 12,
    borderWidth: 1, borderColor: '#E7E5E4', padding: 14,
  },
  seanceEntete: { marginBottom: 10 },
  seanceTitre: { fontSize: 16, fontWeight: '700', color: '#1C1917' },
  seanceDate: { fontSize: 12, color: '#78716C', marginTop: 2 },
  emptyExercices: { color: '#A8A29E', fontStyle: 'italic', fontSize: 13 },
  exerciceRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F5F5F4' },
  exerciceInfo: { marginBottom: 2 },
  exerciceNom: { fontSize: 14, fontWeight: '600', color: '#1C1917' },
  exerciceNiveau: { fontSize: 11, color: '#EA580C', fontWeight: '600', marginTop: 2 },
  consignes: { fontSize: 12, color: '#57534E', marginTop: 4, lineHeight: 17 },
});