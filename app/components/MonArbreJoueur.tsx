// components/MonArbreJoueur.tsx

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { supabase } from '../lib/supabase';
import DetailBriqueJoueur from './DetailBriqueJoueur';

type Brique = { id: string; nom: string; ordre: number };
type Pilier = { id: string; nom: string; ordre: number; briques: Brique[] };

export default function MonArbreJoueur({
  authUserId,
  joueurId,
  coachId,
}: {
  authUserId: string;
  joueurId: string;
  coachId: string;
}) {
  const [piliers, setPiliers] = useState<Pilier[]>([]);
  const [briquesDebloquees, setBriquesDebloquees] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [briqueSelectionnee, setBriqueSelectionnee] = useState<Brique | null>(null);

  async function chargerArbre() {
    setLoading(true);

    const { data: skillTree, error: erreurArbre } = await supabase
      .from('skill_trees')
      .select('id')
      .eq('coach_id', coachId)
      .limit(1)
      .single();

    if (erreurArbre || !skillTree) {
      Alert.alert('Erreur', "Impossible de charger ton arbre de compétences.");
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

    setPiliers(
      ((piliersData ?? []) as any[]).map((p: any) => ({
        ...p,
        briques: (p.briques ?? []).sort((a: any, b: any) => a.ordre - b.ordre),
      }))
    );

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

  if (briqueSelectionnee) {
  return (
    <DetailBriqueJoueur
      briqueId={briqueSelectionnee.id}
      briqueNom={briqueSelectionnee.nom}
      onBack={() => setBriqueSelectionnee(null)}
    />
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
      <Text style={styles.title}>Mon arbre de progression</Text>

      <ScrollView style={styles.scroll}>
        {piliers.length === 0 && (
          <Text style={styles.empty}>Ton coach n'a pas encore configuré d'arbre.</Text>
        )}

        {piliers.map((pilier) => (
          <View key={pilier.id} style={styles.pilierBloc}>
            <Text style={styles.pilierNom}>{pilier.nom}</Text>

            {pilier.briques.length === 0 ? (
              <Text style={styles.emptyBriques}>Rien dans ce pilier pour l'instant.</Text>
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
    onPress={() => debloquee && setBriqueSelectionnee(brique)}
    disabled={!debloquee}
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
  title: { fontSize: 20, fontWeight: '700', color: '#1C1917', padding: 20, paddingBottom: 8 },
  scroll: { flex: 1, paddingHorizontal: 20 },
  empty: { color: '#78716C', fontStyle: 'italic' },
  pilierBloc: { marginBottom: 24 },
  pilierNom: { fontSize: 16, fontWeight: '700', color: '#1C1917', marginBottom: 10 },
  emptyBriques: { color: '#A8A29E', fontStyle: 'italic', fontSize: 13 },
  briqueRow: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    borderRadius: 10, marginBottom: 8, borderWidth: 1,
  },
  briqueDebloquee: { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
  briqueVerrouillee: { backgroundColor: '#F5F5F4', borderColor: '#E7E5E4' },
  briqueIcone: { fontSize: 16, marginRight: 10 },
  briqueNom: { fontSize: 15, color: '#1C1917', fontWeight: '500' },
});