// components/AbonnementScreen.tsx

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Linking } from 'react-native';
import { supabase } from '../lib/supabase';

type Abonnement = {
  plan: string | null;
  statut: string;
  date_fin: string | null;
};

type PlanChoisi = 'mensuel' | 'six_mois' | 'annuel';

const LABELS_PLAN: Record<string, string> = {
  mensuel: 'Mensuel',
  six_mois: '6 mois',
  annuel: 'Annuel',
};

const LIBELLES_STATUT: Record<string, { texte: string; couleur: string }> = {
  essai: { texte: "Période d'essai", couleur: '#92400E' },
  actif: { texte: 'Actif', couleur: '#166534' },
  impaye: { texte: 'Paiement en échec', couleur: '#DC2626' },
  annule: { texte: 'Annulé', couleur: '#78716C' },
};

export default function AbonnementScreen({ onBack }: { onBack: () => void }) {
  const [abonnement, setAbonnement] = useState<Abonnement | null>(null);
  const [loading, setLoading] = useState(true);
  const [chargementAction, setChargementAction] = useState<string | null>(null);

  async function chargerAbonnement() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('abonnements')
      .select('plan, statut, date_fin')
      .eq('coach_id', session.user.id)
      .maybeSingle();

    if (!error) setAbonnement(data);
    setLoading(false);
  }

  useEffect(() => {
    chargerAbonnement();
  }, []);

  async function sAbonner(plan: PlanChoisi) {
    setChargementAction(plan);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setChargementAction(null);
      return;
    }

    const reponse = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-checkout-session`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan }),
      }
    );

    setChargementAction(null);

    if (!reponse.ok) {
      Alert.alert('Erreur', "Impossible de démarrer le paiement pour l'instant.");
      return;
    }

    const { url } = await reponse.json();
    if (url) Linking.openURL(url);
  }

  async function ouvrirPortailClient() {
    setChargementAction('portail');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setChargementAction(null);
      return;
    }

    const reponse = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-portal-session`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    setChargementAction(null);

    if (!reponse.ok) {
      Alert.alert('Erreur', "Impossible d'ouvrir la gestion de l'abonnement pour l'instant.");
      return;
    }

    const { url } = await reponse.json();
    if (url) Linking.openURL(url);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#EA580C" />
      </View>
    );
  }

  const statutInfo = abonnement ? LIBELLES_STATUT[abonnement.statut] : null;
  const peutSAbonner = !abonnement || abonnement.statut === 'essai' || abonnement.statut === 'annule';
  const dateFinFormatee = abonnement?.date_fin
    ? new Date(abonnement.date_fin).toLocaleDateString('fr-FR')
    : null;

  return (
    <View style={styles.container}>
        <TouchableOpacity onPress={onBack}>
  <Text style={{ color: '#EA580C', fontWeight: '600', marginBottom: 16 }}>← Retour</Text>
</TouchableOpacity>
      <Text style={styles.title}>Mon abonnement</Text>

      {abonnement && statutInfo && (
        <View style={styles.carteStatut}>
          <View style={styles.ligneStatut}>
            <Text style={styles.labelStatut}>Statut</Text>
            <Text style={[styles.valeurStatut, { color: statutInfo.couleur }]}>
              {statutInfo.texte}
            </Text>
          </View>
          {abonnement.plan && (
            <View style={styles.ligneStatut}>
              <Text style={styles.labelStatut}>Formule</Text>
              <Text style={styles.valeurStatutNormal}>{LABELS_PLAN[abonnement.plan] ?? abonnement.plan}</Text>
            </View>
          )}
          {dateFinFormatee && (
            <View style={styles.ligneStatut}>
              <Text style={styles.labelStatut}>
                {abonnement.statut === 'essai' ? "Fin de l'essai" : 'Prochain renouvellement'}
              </Text>
              <Text style={styles.valeurStatutNormal}>{dateFinFormatee}</Text>
            </View>
          )}
        </View>
      )}

      {peutSAbonner ? (
        <>
          <Text style={styles.sectionTitle}>Choisir une formule</Text>

          <TouchableOpacity
            style={styles.boutonPlan}
            onPress={() => sAbonner('mensuel')}
            disabled={chargementAction !== null}
          >
            {chargementAction === 'mensuel' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.boutonPlanTitre}>Mensuel</Text>
                <Text style={styles.boutonPlanPrix}>19€/mois</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.boutonPlan}
            onPress={() => sAbonner('six_mois')}
            disabled={chargementAction !== null}
          >
            {chargementAction === 'six_mois' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.boutonPlanTitre}>6 mois</Text>
                <Text style={styles.boutonPlanPrix}>99€ (16,50€/mois)</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.boutonPlan, styles.boutonPlanMisEnAvant]}
            onPress={() => sAbonner('annuel')}
            disabled={chargementAction !== null}
          >
            {chargementAction === 'annuel' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.boutonPlanTitre}>Annuel</Text>
                <Text style={styles.boutonPlanPrix}>190€ (15,83€/mois)</Text>
              </>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity
          style={styles.boutonPortail}
          onPress={ouvrirPortailClient}
          disabled={chargementAction !== null}
        >
          {chargementAction === 'portail' ? (
            <ActivityIndicator color="#EA580C" />
          ) : (
            <Text style={styles.boutonPortailTexte}>Gérer mon abonnement</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8', padding: 20, paddingTop: 60 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAF8' },
  title: { fontSize: 20, fontWeight: '700', color: '#1C1917', marginBottom: 16 },
  carteStatut: {
    backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E7E5E4',
    padding: 16, marginBottom: 24,
  },
  ligneStatut: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6,
  },
  labelStatut: { fontSize: 13, color: '#78716C' },
  valeurStatut: { fontSize: 14, fontWeight: '700' },
  valeurStatutNormal: { fontSize: 14, fontWeight: '600', color: '#1C1917' },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#1C1917', marginBottom: 12 },
  boutonPlan: {
    backgroundColor: '#292524', borderRadius: 10, padding: 16, marginBottom: 10,
  },
  boutonPlanMisEnAvant: { backgroundColor: '#EA580C' },
  boutonPlanTitre: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  boutonPlanPrix: { color: '#E7E5E4', fontSize: 13, marginTop: 2 },
  boutonPortail: {
    borderWidth: 1, borderColor: '#EA580C', borderRadius: 10,
    padding: 16, alignItems: 'center',
  },
  boutonPortailTexte: { color: '#EA580C', fontSize: 15, fontWeight: '600' },
});