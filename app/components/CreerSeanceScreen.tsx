// components/CreerSeanceScreen.tsx

import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../lib/supabase';

type ExerciceAvecContexte = {
  id: string;
  nom: string;
  niveau: string;
  brique_nom: string;
  pilier_nom: string;
};

type ExerciceAjoute = {
  id: string;
  exercice_id: string;
  ordre: number;
  exercice_nom: string;
};

export default function CreerSeanceScreen({
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
  const [titre, setTitre] = useState('');
  const [datePlanifiee, setDatePlanifiee] = useState('');
  const [creation, setCreation] = useState(false);

  const [seanceId, setSeanceId] = useState<string | null>(null);
  const [exercicesDisponibles, setExercicesDisponibles] = useState<ExerciceAvecContexte[]>([]);
  const [exercicesAjoutes, setExercicesAjoutes] = useState<ExerciceAjoute[]>([]);
  const [chargement, setChargement] = useState(false);

  async function creerSeance() {
    if (!titre.trim()) {
      Alert.alert('Titre manquant', 'Donne un titre à cette séance.');
      return;
    }
    setCreation(true);
    const { data, error } = await supabase
      .from('seances')
      .insert({
        joueur_id: joueurId,
        coach_id: coachId,
        titre: titre.trim(),
        date_planifiee: datePlanifiee.trim() || null,
      })
      .select('id')
      .single();
    setCreation(false);

    if (error || !data) {
      Alert.alert('Erreur', error?.message ?? 'Échec de la création de la séance.');
      return;
    }

    setSeanceId(data.id);
    chargerExercicesDisponibles();
  }

  async function chargerExercicesDisponibles() {
    setChargement(true);
    const { data: skillTree } = await supabase
      .from('skill_trees')
      .select('id')
      .eq('coach_id', coachId)
      .limit(1)
      .single();

    if (!skillTree) {
      setChargement(false);
      return;
    }

    const { data: piliersData } = await supabase
      .from('piliers')
      .select('nom, briques(nom, exercices(id, nom, niveau))')
      .eq('skill_tree_id', skillTree.id)
      .order('ordre');

    const liste: ExerciceAvecContexte[] = [];
    ((piliersData ?? []) as any[]).forEach((pilier: any) => {
      (pilier.briques ?? []).forEach((brique: any) => {
        (brique.exercices ?? []).forEach((exercice: any) => {
          liste.push({
            id: exercice.id,
            nom: exercice.nom,
            niveau: exercice.niveau,
            brique_nom: brique.nom,
            pilier_nom: pilier.nom,
          });
        });
      });
    });
    setExercicesDisponibles(liste);
    setChargement(false);
  }

  async function chargerExercicesAjoutes(idSeance: string) {
    const { data } = await supabase
      .from('seances_exercices')
      .select('id, exercice_id, ordre, exercices(nom)')
      .eq('seance_id', idSeance)
      .order('ordre');

    setExercicesAjoutes(
      ((data ?? []) as any[]).map((se: any) => ({
        id: se.id,
        exercice_id: se.exercice_id,
        ordre: se.ordre,
        exercice_nom: se.exercices?.nom ?? '(exercice)',
      }))
    );
  }

  useEffect(() => {
    if (seanceId) chargerExercicesAjoutes(seanceId);
  }, [seanceId]);

  async function ajouterExercice(exerciceId: string) {
    if (!seanceId) return;
    const prochainOrdre = exercicesAjoutes.length + 1;
    const { error } = await supabase.from('seances_exercices').insert({
      seance_id: seanceId,
      exercice_id: exerciceId,
      ordre: prochainOrdre,
    });
    if (error) {
      Alert.alert('Erreur', error.message);
      return;
    }
    chargerExercicesAjoutes(seanceId);
  }

  async function retirerExercice(seanceExerciceId: string) {
    const { error } = await supabase.from('seances_exercices').delete().eq('id', seanceExerciceId);
    if (error) {
      Alert.alert('Erreur', error.message);
      return;
    }
    if (seanceId) chargerExercicesAjoutes(seanceId);
  }

  // ---------- Étape 1 : formulaire de création ----------
  if (!seanceId) {
    return (
      <View style={styles.container}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backLink}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Nouvelle séance pour {joueurNom}</Text>

        <TextInput
          style={styles.input}
          placeholder="Titre de la séance (ex. Travail du tir)"
          placeholderTextColor="#A8A29E"
          value={titre}
          onChangeText={setTitre}
        />
        <TextInput
          style={styles.input}
          placeholder="Date (AAAA-MM-JJ, optionnel)"
          placeholderTextColor="#A8A29E"
          value={datePlanifiee}
          onChangeText={setDatePlanifiee}
          keyboardType="numbers-and-punctuation"
        />

        <TouchableOpacity style={styles.bouton} onPress={creerSeance} disabled={creation}>
          {creation ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.boutonTexte}>Créer la séance</Text>}
        </TouchableOpacity>
      </View>
    );
  }

  // ---------- Étape 2 : ajout des exercices ----------
  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.backLink}>← Retour</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{titre}</Text>
      <Text style={styles.sousTitre}>Ajoute les exercices de cette séance</Text>

      {exercicesAjoutes.length > 0 && (
        <View style={styles.blocAjoutes}>
          <Text style={styles.sectionLabel}>Dans cette séance :</Text>
          {exercicesAjoutes.map((ex) => (
            <View key={ex.id} style={styles.ligneAjoutee}>
              <Text style={styles.ligneAjouteeTexte}>{ex.ordre}. {ex.exercice_nom}</Text>
              <TouchableOpacity onPress={() => retirerExercice(ex.id)}>
                <Text style={styles.retirer}>🗑</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.sectionLabel}>Exercices disponibles :</Text>
      {chargement ? (
        <ActivityIndicator color="#EA580C" />
      ) : (
        <ScrollView style={styles.scroll}>
          {exercicesDisponibles.map((ex) => (
            <View key={ex.id} style={styles.ligneDisponible}>
              <View style={{ flex: 1 }}>
                <Text style={styles.exerciceNom}>{ex.nom}</Text>
                <Text style={styles.exerciceContexte}>
                  {ex.pilier_nom} → {ex.brique_nom} · {ex.niveau}
                </Text>
              </View>
              <TouchableOpacity style={styles.boutonAjouter} onPress={() => ajouterExercice(ex.id)}>
                <Text style={styles.boutonAjouterTexte}>+ Ajouter</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 40, backgroundColor: '#FAFAF8' },
  backLink: { color: '#EA580C', fontWeight: '600', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#1C1917', marginBottom: 4 },
  sousTitre: { fontSize: 14, color: '#78716C', marginBottom: 16 },
  input: {
    borderWidth: 1, borderColor: '#E7E5E4', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    color: '#1C1917', backgroundColor: '#FFFFFF', marginBottom: 12,
  },
  bouton: { backgroundColor: '#EA580C', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  boutonTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#57534E', marginTop: 8, marginBottom: 8 },
  blocAjoutes: { backgroundColor: '#DCFCE7', borderRadius: 10, padding: 12, marginBottom: 16 },
  ligneAjoutee: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  ligneAjouteeTexte: { fontSize: 14, color: '#166534' },
  retirer: { fontSize: 14 },
  scroll: { flex: 1 },
  ligneDisponible: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E7E5E4', borderRadius: 10, padding: 12, marginBottom: 8,
  },
  exerciceNom: { fontSize: 14, fontWeight: '600', color: '#1C1917' },
  exerciceContexte: { fontSize: 11, color: '#A8A29E', marginTop: 2 },
  boutonAjouter: { backgroundColor: '#2563eb', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 },
  boutonAjouterTexte: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
});