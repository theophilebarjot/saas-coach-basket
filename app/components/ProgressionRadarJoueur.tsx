// components/ProgressionRadarJoueur.tsx

import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';
import RadarCompetences from './RadarCompetences';

export default function ProgressionRadarJoueur({ coachId, joueurId }: { coachId: string; joueurId: string }) {
  const [axes, setAxes] = useState<{ label: string; valeur: number }[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function charger() {
      setLoading(true);

      const { data: skillTree } = await supabase
        .from('skill_trees')
        .select('id')
        .eq('coach_id', coachId)
        .limit(1)
        .single();

      if (!skillTree) {
        setAxes([]);
        setLoading(false);
        return;
      }

      // ---- 1. Structure : piliers -> briques (juste les id, pour mapper
      //          ensuite chaque exercice à son pilier) ----
      const { data: piliersData } = await supabase
        .from('piliers')
        .select('id, nom, ordre, briques(id)')
        .eq('skill_tree_id', skillTree.id)
        .order('ordre');

      // Construit brique_id -> pilier_id
      const pilierParBrique = new Map<string, string>();
      ((piliersData ?? []) as any[]).forEach((p) => {
        const briquesDuPilier = Array.isArray(p.briques) ? p.briques : p.briques ? [p.briques] : [];
        briquesDuPilier.forEach((b: any) => pilierParBrique.set(b.id, p.id));
      });

      // ---- 2. Tous les exercices du coach, rattachés à leur pilier via
      //          la brique -- utilisé pour connaître le total par pilier ----
      const { data: exercicesData } = await supabase
        .from('exercices')
        .select('id, brique_id')
        .eq('coach_id', coachId);

      const totalParPilier = new Map<string, number>();
      ((exercicesData ?? []) as any[]).forEach((ex) => {
        if (!ex.brique_id) return;
        const pilierId = pilierParBrique.get(ex.brique_id);
        if (!pilierId) return;
        totalParPilier.set(pilierId, (totalParPilier.get(pilierId) ?? 0) + 1);
      });

      // ---- 3. Exercices VALIDÉS pour ce joueur (via ses soumissions),
      //          seul signal qui doit faire progresser le radar ----
      const { data: soumissionsValidees } = await supabase
        .from('soumissions')
        .select('seances_exercices(exercice_id)')
        .eq('joueur_id', joueurId)
        .eq('statut', 'validee');

      const idsExercicesValides = new Set<string>();
      ((soumissionsValidees ?? []) as any[]).forEach((s) => {
        const se = Array.isArray(s.seances_exercices) ? s.seances_exercices[0] : s.seances_exercices;
        if (se?.exercice_id) idsExercicesValides.add(se.exercice_id);
      });

      const validesParPilier = new Map<string, number>();
      ((exercicesData ?? []) as any[]).forEach((ex) => {
        if (!ex.brique_id || !idsExercicesValides.has(ex.id)) return;
        const pilierId = pilierParBrique.get(ex.brique_id);
        if (!pilierId) return;
        validesParPilier.set(pilierId, (validesParPilier.get(pilierId) ?? 0) + 1);
      });

      // ---- 4. Construction des axes du radar ----
      const axesCalcules = ((piliersData ?? []) as any[]).map((p) => {
        const total = totalParPilier.get(p.id) ?? 0;
        const valides = validesParPilier.get(p.id) ?? 0;
        return { label: p.nom, valeur: total > 0 ? valides / total : 0 };
      });

      setAxes(axesCalcules);
      setLoading(false);
    }
    charger();
  }, [coachId, joueurId]);

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color="#EA580C" />
      </View>
    );
  }

  if (!axes || axes.length === 0) return null;

  return (
    <View style={styles.conteneur}>
      <RadarCompetences axes={axes} />
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { height: 260, justifyContent: 'center', alignItems: 'center' },
  conteneur: { alignItems: 'center', paddingVertical: 12 },
});