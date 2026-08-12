// components/AbonnementBanner.tsx

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { supabase } from '../lib/supabase';

type InfoAbonnement = { statut: string; date_fin: string | null };

export default function AbonnementBanner({ onGerer }: { onGerer: () => void }) {
  const [info, setInfo] = useState<InfoAbonnement | null>(null);

  useEffect(() => {
    async function charger() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from('abonnements')
        .select('statut, date_fin')
        .eq('coach_id', session.user.id)
        .maybeSingle();
      setInfo(data);
    }
    charger();
  }, []);

  // Rien à signaler : abonnement actif, on ne dérange pas le coach.
  if (!info || info.statut === 'actif') return null;

  let texte = '';
  let couleurFond = '#FEF3C7';
  let couleurTexte = '#92400E';

  if (info.statut === 'essai' && info.date_fin) {
    const joursRestants = Math.max(
      0,
      Math.ceil((new Date(info.date_fin).getTime() - Date.now()) / 86400000)
    );
    texte = joursRestants > 0
      ? `Essai gratuit — ${joursRestants} jour${joursRestants > 1 ? 's' : ''} restant${joursRestants > 1 ? 's' : ''}`
      : "Votre essai gratuit est terminé";
    if (joursRestants <= 3) {
      couleurFond = '#FEE2E2';
      couleurTexte = '#DC2626';
    }
  } else if (info.statut === 'impaye') {
    texte = 'Paiement en échec — mettez à jour votre carte';
    couleurFond = '#FEE2E2';
    couleurTexte = '#DC2626';
  } else if (info.statut === 'annule') {
    texte = 'Abonnement annulé';
    couleurFond = '#F5F5F4';
    couleurTexte = '#57534E';
  } else {
    return null;
  }

  return (
    <TouchableOpacity style={[styles.banniere, { backgroundColor: couleurFond }]} onPress={onGerer}>
      <Text style={[styles.texte, { color: couleurTexte }]}>{texte}</Text>
      <Text style={[styles.action, { color: couleurTexte }]}>Gérer →</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banniere: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10,
  },
  texte: { fontSize: 13, fontWeight: '600', flex: 1 },
  action: { fontSize: 13, fontWeight: '700' },
});