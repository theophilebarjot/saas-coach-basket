// components/AccesRestreintScreen.tsx

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

type Raison = 'essai_termine' | 'impaye' | 'annule';

const MESSAGES: Record<Raison, { titre: string; texte: string }> = {
  essai_termine: {
    titre: 'Votre essai gratuit est terminé',
    texte: "Choisissez une formule pour continuer à utiliser l'application avec vos joueurs.",
  },
  impaye: {
    titre: 'Problème de paiement',
    texte: "Le dernier prélèvement a échoué. Mettez à jour votre moyen de paiement pour retrouver l'accès.",
  },
  annule: {
    titre: 'Abonnement annulé',
    texte: "Votre abonnement n'est plus actif. Réabonnez-vous pour continuer à utiliser l'application.",
  },
};

export default function AccesRestreintScreen({
  raison,
  onVoirAbonnement,
}: {
  raison: Raison;
  onVoirAbonnement: () => void;
}) {
  const contenu = MESSAGES[raison];

  return (
    <View style={styles.container}>
      <Text style={styles.icone}>🔒</Text>
      <Text style={styles.titre}>{contenu.titre}</Text>
      <Text style={styles.texte}>{contenu.texte}</Text>

      <TouchableOpacity style={styles.bouton} onPress={onVoirAbonnement}>
        <Text style={styles.boutonTexte}>Voir les formules</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#FAFAF8', padding: 32,
  },
  icone: { fontSize: 40, marginBottom: 16 },
  titre: { fontSize: 20, fontWeight: '700', color: '#1C1917', marginBottom: 10, textAlign: 'center' },
  texte: { fontSize: 14, color: '#57534E', textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  bouton: { backgroundColor: '#EA580C', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32 },
  boutonTexte: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});