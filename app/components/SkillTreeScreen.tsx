import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';

type Brique = {
  id: string;
  nom: string;
  ordre: number;
};

type Pilier = {
  id: string;
  nom: string;
  ordre: number;
  briques: Brique[];
};

export default function SkillTreeScreen({
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
  const [loading, setLoading] = useState(true);

  async function chargerArbre() {
    setLoading(true);

    // 1. Le skill tree appartient au coach, pas au joueur -- on retrouve
    //    l'arbre du coach connecté (celui cloné automatiquement à son
    //    inscription).
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

    // 2. Piliers + briques en une seule requête imbriquée (Supabase suit
    //    automatiquement la relation de clé étrangère briques.pilier_id).
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

    setPiliers(
      (piliersData ?? []).map((p) => ({
        ...p,
        briques: (p.briques ?? []).sort((a, b) => a.ordre - b.ordre),
      }))
    );

    // 3. Quelles briques ce joueur précis a-t-il débloquées ?
    const { data: debloquees } = await supabase
      .from('briques_debloquees')
      .select('brique_id')
      .eq('joueur_id', joueurId);

    setBriquesDebloquees(new Set((debloquees ?? []).map((d) => d.brique_id)));
    setLoading(false);
  }

  useEffect(() => {
    chargerArbre();
  }, [joueurId]);

  async function toggleBrique(briqueId: string) {
    const estDebloquee = briquesDebloquees.has(briqueId);

    if (estDebloquee) {
      const { error } = await supabase
        .from('briques_debloquees')
        .delete()
        .eq('joueur_id', joueurId)
        .eq('brique_id', briqueId);
      if (error) {
        Alert.alert('Erreur', error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from('briques_debloquees')
        .insert({ joueur_id: joueurId, brique_id: briqueId });
      if (error) {
        Alert.alert('Erreur', error.message);
        return;
      }
    }

    // Mise à jour optimiste locale, pas besoin de tout recharger.
    setBriquesDebloquees((prev) => {
      const copie = new Set(prev);
      estDebloquee ? copie.delete(briqueId) : copie.add(briqueId);
      return copie;
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
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backLink}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Arbre de {joueurNom}</Text>
      </View>

      <ScrollView style={styles.scroll}>
        {piliers.length === 0 && (
          <Text style={styles.empty}>Aucun pilier dans cet arbre pour l'instant.</Text>
        )}

        {piliers.map((pilier) => (
          <View key={pilier.id} style={styles.pilierBloc}>
            <Text style={styles.pilierNom}>{pilier.nom}</Text>

            {pilier.briques.length === 0 ? (
              <Text style={styles.emptyBriques}>Aucune brique dans ce pilier.</Text>
            ) : (
              pilier.briques.map((brique) => {
                const debloquee = briquesDebloquees.has(brique.id);
                return (
                  <TouchableOpacity
                    key={brique.id}
                    style={[
                      styles.briqueRow,
                      debloquee ? styles.briqueDebloquee : styles.briqueVerrouillee,
                    ]}
                    onPress={() => toggleBrique(brique.id)}
                  >
                    <Text style={styles.briqueIcone}>{debloquee ? '🔓' : '🔒'}</Text>
                    <Text style={styles.briqueNom}>{brique.nom}</Text>
                  </TouchableOpacity>
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
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAF8' },
  header: { padding: 20, paddingTop: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E7E5E4' },
  backLink: { color: '#EA580C', fontWeight: '600', marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#1C1917' },
  scroll: { flex: 1, padding: 20 },
  empty: { color: '#78716C', fontStyle: 'italic' },
  pilierBloc: { marginBottom: 24 },
  pilierNom: { fontSize: 16, fontWeight: '700', color: '#1C1917', marginBottom: 10 },
  emptyBriques: { color: '#A8A29E', fontStyle: 'italic', fontSize: 13 },
  briqueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
  },
  briqueDebloquee: { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
  briqueVerrouillee: { backgroundColor: '#F5F5F4', borderColor: '#E7E5E4' },
  briqueIcone: { fontSize: 16, marginRight: 10 },
  briqueNom: { fontSize: 15, color: '#1C1917', fontWeight: '500' },
});