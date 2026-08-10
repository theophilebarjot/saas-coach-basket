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

type Niveau = 'debutant' | 'intermediaire' | 'avance';
type Exercice = { id: string; nom: string; niveau: Niveau };
type Brique = { id: string; nom: string; ordre: number; exercices: Exercice[] };
type Pilier = { id: string; nom: string; ordre: number; briques: Brique[] };

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
  // Brouillons pour les cases d'exercice encore vides (pas encore en base)
  const [brouillons, setBrouillons] = useState<Record<string, string>>({});

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

    // Requête imbriquée sur 3 niveaux : piliers -> briques -> exercices,
    // Supabase suit les clés étrangères automatiquement.
    const { data, error } = await supabase
      .from('piliers')
      .select('id, nom, ordre, briques(id, nom, ordre, exercices(id, nom, niveau))')
      .eq('skill_tree_id', skillTree.id)
      .order('ordre');

    if (error) {
      Alert.alert('Erreur', error.message);
      setLoading(false);
      return;
    }

    setPiliers(
      (data ?? []).map((p) => ({
        ...p,
        briques: (p.briques ?? [])
          .sort((a, b) => a.ordre - b.ordre)
          .map((b) => ({ ...b, exercices: b.exercices ?? [] })),
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
    if (error) return Alert.alert('Erreur', error.message);
    setNouveauPilierNom('');
    chargerArbre();
  }

  function renommerPilier(pilierId: string, nouveauNom: string) {
    setPiliers((prev) => prev.map((p) => (p.id === pilierId ? { ...p, nom: nouveauNom } : p)));
  }

  async function sauvegarderPilier(pilierId: string, nom: string) {
    if (!nom.trim()) return;
    const { error } = await supabase.from('piliers').update({ nom: nom.trim() }).eq('id', pilierId);
    if (error) Alert.alert('Erreur', error.message);
  }

  function confirmerSuppressionPilier(pilierId: string, nom: string) {
    Alert.alert('Supprimer ce pilier ?', `"${nom}" et tout son contenu seront supprimés.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('piliers').delete().eq('id', pilierId);
          if (error) Alert.alert('Erreur', error.message);
          else chargerArbre();
        },
      },
    ]);
  }

  // --- Briques (les "dérivés") ---

  async function ajouterBrique(pilierId: string) {
    const pilier = piliers.find((p) => p.id === pilierId);
    const { error } = await supabase.from('briques').insert({
      pilier_id: pilierId,
      nom: 'Nouveau dérivé',
      ordre: (pilier?.briques.length ?? 0) + 1,
    });
    if (error) return Alert.alert('Erreur', error.message);
    chargerArbre();
  }

  function renommerBrique(pilierId: string, briqueId: string, nouveauNom: string) {
    setPiliers((prev) =>
      prev.map((p) =>
        p.id === pilierId
          ? { ...p, briques: p.briques.map((b) => (b.id === briqueId ? { ...b, nom: nouveauNom } : b)) }
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
    Alert.alert('Supprimer ce dérivé ?', `"${nom}" et ses exercices seront supprimés.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('briques').delete().eq('id', briqueId);
          if (error) Alert.alert('Erreur', error.message);
          else chargerArbre();
        },
      },
    ]);
  }

  // --- Exercices (un par niveau, dans chaque brique) ---

  async function sauvegarderExerciceExistant(exerciceId: string, nom: string) {
    if (!nom.trim()) return;
    const { error } = await supabase.from('exercices').update({ nom: nom.trim() }).eq('id', exerciceId);
    if (error) Alert.alert('Erreur', error.message);
  }

  async function creerExercice(briqueId: string, niveau: Niveau) {
    const cle = `${briqueId}-${niveau}`;
    const nom = brouillons[cle]?.trim();
    if (!nom) return;
    const { error } = await supabase.from('exercices').insert({
      coach_id: coachId,
      brique_id: briqueId,
      niveau,
      nom,
    });
    if (error) return Alert.alert('Erreur', error.message);
    setBrouillons((prev) => ({ ...prev, [cle]: '' }));
    chargerArbre();
  }

  function confirmerSuppressionExercice(exerciceId: string, nom: string) {
    Alert.alert('Supprimer cet exercice ?', `"${nom}" sera supprimé.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('exercices').delete().eq('id', exerciceId);
          if (error) Alert.alert('Erreur', error.message);
          else chargerArbre();
        },
      },
    ]);
  }

  function renommerExerciceLocal(briqueId: string, exerciceId: string, texte: string) {
    setPiliers((prev) =>
      prev.map((p) => ({
        ...p,
        briques: p.briques.map((b) =>
          b.id === briqueId
            ? { ...b, exercices: b.exercices.map((e) => (e.id === exerciceId ? { ...e, nom: texte } : e)) }
            : b
        ),
      }))
    );
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
                onChangeText={(t) => renommerPilier(pilier.id, t)}
                onEndEditing={() => sauvegarderPilier(pilier.id, pilier.nom)}
              />
              <TouchableOpacity onPress={() => confirmerSuppressionPilier(pilier.id, pilier.nom)}>
                <Text style={styles.deleteIcon}>🗑</Text>
              </TouchableOpacity>
            </View>

            {pilier.briques.map((brique) => (
              <View key={brique.id} style={styles.briqueBloc}>
                <View style={styles.briqueHeader}>
                  <TextInput
                    style={styles.briqueInput}
                    value={brique.nom}
                    onChangeText={(t) => renommerBrique(pilier.id, brique.id, t)}
                    onEndEditing={() => sauvegarderBrique(brique.id, brique.nom)}
                  />
                  <TouchableOpacity onPress={() => confirmerSuppressionBrique(brique.id, brique.nom)}>
                    <Text style={styles.deleteIcon}>🗑</Text>
                  </TouchableOpacity>
                </View>

                {NIVEAUX.map(({ valeur, label }) => {
                  const exercice = brique.exercices.find((e) => e.niveau === valeur);
                  const cle = `${brique.id}-${valeur}`;
                  return (
                    <View key={valeur} style={styles.niveauRow}>
                      <Text style={styles.niveauLabel}>{label}</Text>
                      {exercice ? (
                        <>
                          <TextInput
                            style={styles.exerciceInput}
                            value={exercice.nom}
                            onChangeText={(t) => renommerExerciceLocal(brique.id, exercice.id, t)}
                            onEndEditing={() => sauvegarderExerciceExistant(exercice.id, exercice.nom)}
                          />
                          <TouchableOpacity
                            onPress={() => confirmerSuppressionExercice(exercice.id, exercice.nom)}
                          >
                            <Text style={styles.deleteIcon}>🗑</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <TextInput
                          style={styles.exerciceInputVide}
                          placeholder="+ Ajouter un exercice"
                          placeholderTextColor="#A8A29E"
                          value={brouillons[cle] ?? ''}
                          onChangeText={(t) => setBrouillons((prev) => ({ ...prev, [cle]: t }))}
                          onEndEditing={() => creerExercice(brique.id, valeur)}
                        />
                      )}
                    </View>
                  );
                })}
              </View>
            ))}

            <TouchableOpacity style={styles.addLink} onPress={() => ajouterBrique(pilier.id)}>
              <Text style={styles.addLinkText}>+ Ajouter un dérivé</Text>
            </TouchableOpacity>
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
    marginBottom: 22,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E7E5E4',
  },
  pilierHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  pilierInput: {
    flex: 1,
    fontSize: 17,
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
  briqueBloc: {
    marginLeft: 10,
    marginBottom: 12,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: '#FED7AA',
  },
  briqueHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  briqueInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1917',
    borderWidth: 1,
    borderColor: '#E7E5E4',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginRight: 8,
    backgroundColor: '#FFFFFF',
  },
  niveauRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, marginLeft: 8 },
  niveauLabel: { fontSize: 11, color: '#A8A29E', width: 88 },
  exerciceInput: {
    flex: 1,
    fontSize: 13,
    color: '#1C1917',
    borderWidth: 1,
    borderColor: '#E7E5E4',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginRight: 6,
    backgroundColor: '#FFFFFF',
  },
  exerciceInputVide: {
    flex: 1,
    fontSize: 13,
    color: '#1C1917',
    borderWidth: 1,
    borderColor: '#E7E5E4',
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#FAFAF8',
  },
  deleteIcon: { fontSize: 14, padding: 4 },
  addLink: { marginLeft: 10, marginTop: 2 },
  addLinkText: { color: '#EA580C', fontSize: 13, fontWeight: '600' },
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