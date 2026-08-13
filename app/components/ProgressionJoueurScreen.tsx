// components/ProgressionJoueurScreen.tsx

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { supabase } from '../lib/supabase';
import ProgressionRadarJoueur from './ProgressionRadarJoueur';

type Exercice = { id: string; nom: string; niveau: string | null };
type Brique = { id: string; nom: string; ordre: number; exercices: Exercice[] };
type Pilier = { id: string; nom: string; ordre: number; briques: Brique[] };

export default function ProgressionJoueurScreen({
  coachId,
  joueurId,
  joueurNom,
  onBack,
}: {
  coachId: string;
  joueurId: string;
  joueurNom: string;
  onBack: () => void;
}) {
  const [piliers, setPiliers] = useState<Pilier[]>([]);
  const [briquesDebloquees, setBriquesDebloquees] = useState<Set<string>>(new Set());
  const [exercicesValides, setExercicesValides] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [enCoursId, setEnCoursId] = useState<string | null>(null);

  async function chargerDonnees() {
    setLoading(true);

    // ---- 1. Structure du skill tree du coach ----
    const { data: skillTree, error: erreurArbre } = await supabase
      .from('skill_trees')
      .select('id')
      .eq('coach_id', coachId)
      .limit(1)
      .single();

    if (erreurArbre || !skillTree) {
      Alert.alert('Erreur', "Impossible de charger l'arbre de compétences.");
      setLoading(false);
      return;
    }

    const { data: piliersData, error: erreurPiliers } = await supabase
      .from('piliers')
      .select('id, nom, ordre, briques(id, nom, ordre)')
      .eq('skill_tree_id', skillTree.id)
      .order('ordre');

    if (erreurPiliers) {
      Alert.alert('Erreur', erreurPiliers.message);
      setLoading(false);
      return;
    }

    // ---- 2. Exercices de toutes les briques (requête séparée : plus simple
    //          à fiabiliser qu'un embed profond piliers→briques→exercices) ----
    const { data: exercicesData, error: erreurExercices } = await supabase
      .from('exercices')
      .select('id, brique_id, nom, niveau')
      .eq('coach_id', coachId);

    if (erreurExercices) {
      Alert.alert('Erreur', erreurExercices.message);
      setLoading(false);
      return;
    }

    const exercicesParBrique = new Map<string, Exercice[]>();
    ((exercicesData ?? []) as any[]).forEach((ex) => {
      if (!ex.brique_id) return;
      const liste = exercicesParBrique.get(ex.brique_id) ?? [];
      liste.push({ id: ex.id, nom: ex.nom, niveau: ex.niveau });
      exercicesParBrique.set(ex.brique_id, liste);
    });

    const piliersFormates: Pilier[] = ((piliersData ?? []) as any[]).map((p: any) => ({
      ...p,
      briques: (p.briques ?? [])
        .map((b: any) => ({ ...b, exercices: exercicesParBrique.get(b.id) ?? [] }))
        .sort((a: any, b: any) => a.ordre - b.ordre),
    }));

    setPiliers(piliersFormates);

    // ---- 3. Briques déjà débloquées pour ce joueur ----
    const { data: debloquees } = await supabase
      .from('briques_debloquees')
      .select('brique_id')
      .eq('joueur_id', joueurId);

    setBriquesDebloquees(new Set((debloquees ?? []).map((d) => d.brique_id)));

    // ---- 4. Exercices validés pour ce joueur (via ses soumissions) ----
    const { data: soumissionsValidees, error: erreurSoumissions } = await supabase
      .from('soumissions')
      .select('seances_exercices(exercice_id)')
      .eq('joueur_id', joueurId)
      .eq('statut', 'validee');

    if (!erreurSoumissions) {
      const idsValides = new Set<string>();
      ((soumissionsValidees ?? []) as any[]).forEach((s) => {
        const se = Array.isArray(s.seances_exercices) ? s.seances_exercices[0] : s.seances_exercices;
        if (se?.exercice_id) idsValides.add(se.exercice_id);
      });
      setExercicesValides(idsValides);
    }

    setLoading(false);
  }

  useEffect(() => {
    chargerDonnees();
  }, [joueurId]);

  async function debloquerBrique(briqueId: string) {
    setEnCoursId(briqueId);
    const { error } = await supabase.from('briques_debloquees').insert({
      joueur_id: joueurId,
      brique_id: briqueId,
      debloquee_par_coach_id: coachId,
    });
    setEnCoursId(null);

    if (error) {
      Alert.alert('Erreur', "Le déblocage a échoué : " + error.message);
      return;
    }
    setBriquesDebloquees((prev) => new Set(prev).add(briqueId));
  }

  async function verrouillerBrique(briqueId: string) {
    setEnCoursId(briqueId);
    const { error } = await supabase
      .from('briques_debloquees')
      .delete()
      .eq('joueur_id', joueurId)
      .eq('brique_id', briqueId);
    setEnCoursId(null);

    if (error) {
      Alert.alert('Erreur', "Le verrouillage a échoué : " + error.message);
      return;
    }
    setBriquesDebloquees((prev) => {
      const next = new Set(prev);
      next.delete(briqueId);
      return next;
    });
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
        <Text style={styles.backLink}>← Retour à la fiche</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Progression de {joueurNom}</Text>

<ProgressionRadarJoueur coachId={coachId} joueurId={joueurId} />

<ScrollView style={styles.scroll}>
        {piliers.length === 0 && (
          <Text style={styles.empty}>Aucun arbre de compétences configuré.</Text>
        )}

        {piliers.map((pilier) => (
          <View key={pilier.id} style={styles.pilierBloc}>
            <Text style={styles.pilierNom}>{pilier.nom}</Text>

            {pilier.briques.length === 0 ? (
              <Text style={styles.emptyBriques}>Rien dans ce pilier pour l'instant.</Text>
            ) : (
              pilier.briques.map((brique) => {
                const debloquee = briquesDebloquees.has(brique.id);
                const totalExercices = brique.exercices.length;
                const nbValides = brique.exercices.filter((ex) => exercicesValides.has(ex.id)).length;
                const enCours = enCoursId === brique.id;

                return (
                  <View key={brique.id} style={styles.briqueCarte}>
                    <View style={styles.briqueEntete}>
                      <Text style={styles.briqueIcone}>{debloquee ? '🔓' : '🔒'}</Text>
                      <Text style={styles.briqueNom}>{brique.nom}</Text>
                    </View>

                    {totalExercices > 0 && (
                      <Text style={styles.progressionTexte}>
                        {nbValides}/{totalExercices} exercice{totalExercices > 1 ? 's' : ''} validé{nbValides > 1 ? 's' : ''}
                      </Text>
                    )}

                    <TouchableOpacity
                      style={debloquee ? styles.boutonVerrouiller : styles.boutonDebloquer}
                      onPress={() => (debloquee ? verrouillerBrique(brique.id) : debloquerBrique(brique.id))}
                      disabled={enCours}
                    >
                      {enCours ? (
                        <ActivityIndicator size="small" color={debloquee ? '#DC2626' : '#FFFFFF'} />
                      ) : (
                        <Text style={debloquee ? styles.texteVerrouiller : styles.texteDebloquer}>
                          {debloquee ? 'Verrouiller' : 'Débloquer'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })
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
  pilierBloc: { marginBottom: 22 },
  pilierNom: { fontSize: 16, fontWeight: '700', color: '#1C1917', marginBottom: 10 },
  emptyBriques: { color: '#A8A29E', fontStyle: 'italic', fontSize: 13 },
  briqueCarte: {
    backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E7E5E4',
    padding: 12, marginBottom: 8,
  },
  briqueEntete: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  briqueIcone: { fontSize: 15, marginRight: 8 },
  briqueNom: { fontSize: 14, fontWeight: '600', color: '#1C1917' },
  progressionTexte: { fontSize: 12, color: '#57534E', marginBottom: 10 },
  boutonDebloquer: {
    alignSelf: 'flex-start', backgroundColor: '#16A34A',
    paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8,
  },
  texteDebloquer: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  boutonVerrouiller: {
    alignSelf: 'flex-start', borderWidth: 1, borderColor: '#DC2626',
    paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8,
  },
  texteVerrouiller: { color: '#DC2626', fontSize: 13, fontWeight: '600' },
});