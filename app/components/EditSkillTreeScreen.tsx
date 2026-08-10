import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';

type Brique = { id: string; nom: string; ordre: number };
type Niveau = 'debutant' | 'intermediaire' | 'avance';
type Exercice = { id: string; nom: string; niveau: Niveau };
type Pilier = {
  id: string;
  nom: string;
  ordre: number;
  briques: Brique[];
  exercices: Exercice[];
};

const NIVEAUX: { valeur: Niveau; label: string }[] = [
  { valeur: 'debutant', label: 'Débutant' },
  { valeur: 'intermediaire', label: 'Intermédiaire' },
  { valeur: 'avance', label: 'Avancé' },
];

export default function EditSkillTreeScreen({
  coachId,
  onBack,
}: {
  coachId: string;
  onBack: () => void;
}) {
  const [skillTreeId, setSkillTreeId] = useState<string | null>(null);
  const [piliers, setPiliers] = useState<Pilier[]>([]);
  const [loading, setLoading] = useState(true);
  const [nouveauPilierNom, setNouveauPilierNom] = useState('');

  async function chargerArbre() {
    setLoading(true);
    const { data: skillTree, error: erreurArbre } = await supabase
      .from('skill_trees')
      .select('id')
      .eq('coach_id', coachId)
      .limit(1)
      .single();

    if (erreurArbre || !skillTree) {
      Alert.alert('Erreur', "Impossible de charger votre arbre de compétences.");
      setLoading(false);
      return;
    }
    setSkillTreeId(skillTree.id);

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

    // Les exercices se chargent à part (ils appartiennent au coach,
    // rattachés à un pilier, pas imbriqués dans la requête piliers).
    const pilierIds = (piliersData ?? []).map((p) => p.id);
    const { data: exercicesData, error: erreurExercices } = await supabase
      .from('exercices')
      .select('id, nom, niveau, pilier_id')
      .in('pilier_id', pilierIds);

    if (erreurExercices) {
      Alert.alert('Erreur', erreurExercices.message);
      setLoading(false);
      return;
    }

    setPiliers(
      (piliersData ?? []).map((p) => ({
        ...p,
        briques: (p.briques ?? []).sort((a, b) => a.ordre - b.ordre),
        exercices: (exercicesData ?? []).filter((e) => e.pilier_id === p.id),
      }))
    );
    setLoading(false);
  }

  useEffect(() => {
    chargerArbre();
  }, []);

  // --- Piliers ---

  async function ajouterPilier() {
    if (!nouveauPilierNom.trim() || !skillTreeId) return;
    const { error } = await supabase.from('piliers').insert({
      skill_tree_id: skillTreeId,
      nom: nouveauPilierNom.trim(),
      ordre: piliers.length + 1,
    });
    if (error) {
      Alert.alert('Erreur', error.message);
      return;
    }
    setNouveauPilierNom('');
    chargerArbre();
  }

  function renommerPilier(pilierId: string, nouveauNom: string) {
    setPiliers((prev) =>
      prev.map((p) => (p.id === pilierId ? { ...p, nom: nouveauNom } : p))
    );
  }

  async function sauvegarderPilier(pilierId: string, nom: string) {
    if (!nom.trim()) return;
    const { error } = await supabase.from('piliers').update({ nom: nom.trim() }).eq('id', pilierId);
    if (error) Alert.alert('Erreur', error.message);
  }

  function confirmerSuppressionPilier(pilierId: string, nom: string) {
    Alert.alert(
      'Supprimer ce pilier ?',
      `"${nom}", ses briques et ses exercices seront supprimés définitivement.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('piliers').delete().eq('id', pilierId);
            if (error) {
              Alert.alert('Erreur', error.message);
            } else {
              chargerArbre();
            }
          },
        },
      ]
    );
  }

  // --- Briques ---

  async function ajouterBrique(pilierId: string) {
    const pilier = piliers.find((p) => p.id === pilierId);
    const { error } = await supabase.from('briques').insert({
      pilier_id: pilierId,
      nom: 'Nouvelle brique',
      ordre: (pilier?.briques.length ?? 0) + 1,
    });
    if (error) {
      Alert.alert('Erreur', error.message);
      return;
    }
    chargerArbre();
  }

  function renommerBrique(pilierId: string, briqueId: string, nouveauNom: string) {
    setPiliers((prev) =>
      prev.map((p) =>
        p.id === pilierId
          ? {
              ...p,
              briques: p.briques.map((b) =>
                b.id === briqueId ? { ...b, nom: nouveauNom } : b
              ),
            }
          : p
      )
    );
  }

  async function sauvegarderBrique(briqueId: string, nom: string) {
    if (!nom.trim()) return;
    const { error } = await supabase.from('briques').update({ nom: nom.trim() }).eq('id', briqueId);
    if (error) Alert.alert('Erreur', error.message);
  }

  function confirmerSuppressionBrique(briqueId: string, nom: string) {
    Alert.alert('Supprimer cette brique ?', `"${nom}" sera supprimée définitivement.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('briques').delete().eq('id', briqueId);
          if (error) {
            Alert.alert('Erreur', error.message);
          } else {
            chargerArbre();
          }
        },
      },
    ]);
  }

  // --- Exercices ---

  async function ajouterExercice(pilierId: string, niveau: Niveau) {
    const { error } = await supabase.from('exercices').insert({
      coach_id: coachId,
      pilier_id: pilierId,
      niveau,
      nom: 'Nouvel exercice',
    });
    if (error) {
      Alert.alert('Erreur', error.message);
      return;
    }
    chargerArbre();
  }

  function renommerExercice(pilierId: string, exerciceId: string, nouveauNom: string) {
    setPiliers((prev) =>
      prev.map((p) =>
        p.id === pilierId
          ? {
              ...p,
              exercices: p.exercices.map((e) =>
                e.id === exerciceId ? { ...e, nom: nouveauNom } : e
              ),
            }
          : p
      )
    );
  }

  async function sauvegarderExercice(exerciceId: string, nom: string) {
    if (!nom.trim()) return;
    const { error } = await supabase.from('exercices').update({ nom: nom.trim() }).eq('id', exerciceId);
    if (error) Alert.alert('Erreur', error.message);
  }

  function confirmerSuppressionExercice(exerciceId: string, nom: string) {
    Alert.alert('Supprimer cet exercice ?', `"${nom}" sera supprimé définitivement.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('exercices').delete().eq('id', exerciceId);
          if (error) {
            Alert.alert('Erreur', error.message);
          } else {
            chargerArbre();
          }
        },
      },
    ]);
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
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backLink}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Modifier mon arbre</Text>
      </View>

      <ScrollView style={styles.scroll}>
        {piliers.map((pilier) => (
          <View key={pilier.id} style={styles.pilierBloc}>
            <View style={styles.pilierHeader}>
              <TextInput
                style={styles.pilierInput}
                value={pilier.nom}
                onChangeText={(texte) => renommerPilier(pilier.id, texte)}
                onEndEditing={() => sauvegarderPilier(pilier.id, pilier.nom)}
              />
              <TouchableOpacity onPress={() => confirmerSuppressionPilier(pilier.id, pilier.nom)}>
                <Text style={styles.deleteIcon}>🗑</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sousTitre}>Briques de progression</Text>
            {pilier.briques.map((brique) => (
              <View key={brique.id} style={styles.itemRow}>
                <TextInput
                  style={styles.itemInput}
                  value={brique.nom}
                  onChangeText={(texte) => renommerBrique(pilier.id, brique.id, texte)}
                  onEndEditing={() => sauvegarderBrique(brique.id, brique.nom)}
                />
                <TouchableOpacity onPress={() => confirmerSuppressionBrique(brique.id, brique.nom)}>
                  <Text style={styles.deleteIcon}>🗑</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.addLink} onPress={() => ajouterBrique(pilier.id)}>
              <Text style={styles.addLinkText}>+ Ajouter une brique</Text>
            </TouchableOpacity>

            <Text style={[styles.sousTitre, { marginTop: 16 }]}>Exercices par niveau</Text>
            {NIVEAUX.map(({ valeur, label }) => (
              <View key={valeur} style={styles.niveauBloc}>
                <Text style={styles.niveauLabel}>{label}</Text>
                {pilier.exercices
                  .filter((e) => e.niveau === valeur)
                  .map((exercice) => (
                    <View key={exercice.id} style={styles.itemRow}>
                      <TextInput
                        style={styles.itemInput}
                        value={exercice.nom}
                        onChangeText={(texte) => renommerExercice(pilier.id, exercice.id, texte)}
                        onEndEditing={() => sauvegarderExercice(exercice.id, exercice.nom)}
                      />
                      <TouchableOpacity
                        onPress={() => confirmerSuppressionExercice(exercice.id, exercice.nom)}
                      >
                        <Text style={styles.deleteIcon}>🗑</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                <TouchableOpacity
                  style={styles.addLink}
                  onPress={() => ajouterExercice(pilier.id, valeur)}
                >
                  <Text style={styles.addLinkText}>+ Ajouter un exercice {label.toLowerCase()}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.nouveauPilierBloc}>
          <TextInput
            style={styles.pilierInput}
            placeholder="Nom du nouveau pilier"
            placeholderTextColor="#A8A29E"
            value={nouveauPilierNom}
            onChangeText={setNouveauPilierNom}
          />
          <TouchableOpacity style={styles.addPilierButton} onPress={ajouterPilier}>
            <Text style={styles.addPilierText}>+ Ajouter un pilier</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAF8' },
  header: { padding: 20, paddingTop: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E7E5E4' },
  backLink: { color: '#EA580C', fontWeight: '600', marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#1C1917' },
  scroll: { flex: 1, padding: 20 },
  pilierBloc: {
    marginBottom: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E7E5E4',
  },
  pilierHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  pilierInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1917',
    borderWidth: 1,
    borderColor: '#E7E5E4',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: '#FAFAF8',
  },
  sousTitre: { fontSize: 13, fontWeight: '700', color: '#78716C', marginTop: 10, marginBottom: 6, textTransform: 'uppercase' },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginLeft: 12 },
  itemInput: {
    flex: 1,
    fontSize: 14,
    color: '#1C1917',
    borderWidth: 1,
    borderColor: '#E7E5E4',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginRight: 8,
    backgroundColor: '#FFFFFF',
  },
  deleteIcon: { fontSize: 16, padding: 4 },
  addLink: { marginLeft: 12, marginTop: 2, marginBottom: 4 },
  addLinkText: { color: '#EA580C', fontSize: 13, fontWeight: '600' },
  niveauBloc: { marginLeft: 12, marginBottom: 8 },
  niveauLabel: { fontSize: 12, fontWeight: '700', color: '#A8A29E', marginBottom: 4 },
  nouveauPilierBloc: { marginTop: 8, marginBottom: 30 },
  addPilierButton: {
    backgroundColor: '#EA580C',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  addPilierText: { color: '#FFFFFF', fontWeight: '600' },
});