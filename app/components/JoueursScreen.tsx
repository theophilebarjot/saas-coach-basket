import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';
import SkillTreeScreen from './SkillTreeScreen';
import EditSkillTreeScreen from './EditSkillTreeScreen';

type Joueur = {
  id: string;
  prenom: string;
  nom: string | null;
  date_naissance: string;
  email_parent: string | null;
  statut_acces_service: string;
};

const SEUIL_MAJORITE_NUMERIQUE = 15;

function calculerAge(dateNaissance: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateNaissance)) return null;
  const naissance = new Date(dateNaissance);
  if (isNaN(naissance.getTime())) return null;
  const aujourdHui = new Date();
  let age = aujourdHui.getFullYear() - naissance.getFullYear();
  const moisDiff = aujourdHui.getMonth() - naissance.getMonth();
  if (moisDiff < 0 || (moisDiff === 0 && aujourdHui.getDate() < naissance.getDate())) {
    age--;
  }
  return age;
}

export default function JoueursScreen({ coachId }: { coachId: string }) {
  const [joueurs, setJoueurs] = useState<Joueur[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [dateNaissance, setDateNaissance] = useState('');
  const [emailParent, setEmailParent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [joueurSelectionne, setJoueurSelectionne] = useState<Joueur | null>(null);
  const [editionArbre, setEditionArbre] = useState(false);

  const age = calculerAge(dateNaissance);
  const estMineur = age !== null && age < SEUIL_MAJORITE_NUMERIQUE;

  async function chargerJoueurs() {
    setLoadingList(true);
    const { data, error } = await supabase
      .from('joueurs')
      .select('id, prenom, nom, date_naissance, email_parent, statut_acces_service')
      .order('prenom');
    if (error) {
      Alert.alert('Erreur de chargement', error.message);
    } else {
      setJoueurs(data ?? []);
    }
    setLoadingList(false);
  }

  useEffect(() => {
    chargerJoueurs();
  }, []);

  async function handleAjouterJoueur() {
    if (!prenom.trim()) {
      Alert.alert('Champ manquant', 'Le prénom est obligatoire.');
      return;
    }
    if (age === null) {
      Alert.alert('Date invalide', 'Utilisez le format AAAA-MM-JJ, par exemple 2012-03-15.');
      return;
    }
    if (estMineur && !emailParent.trim()) {
      Alert.alert(
        'Email du parent requis',
        `Ce joueur a ${age} ans. En dessous de ${SEUIL_MAJORITE_NUMERIQUE} ans, l'email d'un parent est obligatoire pour la procédure de consentement.`
      );
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from('joueurs').insert({
      coach_id: coachId,
      prenom: prenom.trim(),
      nom: nom.trim() || null,
      date_naissance: dateNaissance,
      email_parent: estMineur ? emailParent.trim() : null,
    });
    setSubmitting(false);

    if (error) {
      Alert.alert('Erreur à la création', error.message);
      return;
    }

    setPrenom('');
    setNom('');
    setDateNaissance('');
    setEmailParent('');
    chargerJoueurs();
  }
  if (editionArbre) {
  return <EditSkillTreeScreen coachId={coachId} onBack={() => setEditionArbre(false)} />;
}
  if (joueurSelectionne) {
    return (
      <SkillTreeScreen
        coachId={coachId}
        joueurId={joueurSelectionne.id}
        joueurNom={`${joueurSelectionne.prenom} ${joueurSelectionne.nom ?? ''}`}
        onBack={() => setJoueurSelectionne(null)}
      />
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mes joueurs</Text>
      <TouchableOpacity onPress={() => setEditionArbre(true)}>
  <Text style={{ color: '#EA580C', fontWeight: '600', marginBottom: 16 }}>
    ⚙️ Modifier mon arbre de compétences
  </Text>
</TouchableOpacity>

      {loadingList ? (
        <ActivityIndicator color="#EA580C" style={{ marginVertical: 16 }} />
      ) : (
        <FlatList
          data={joueurs}
          keyExtractor={(item) => item.id}
          style={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>Aucun joueur pour l'instant.</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.joueurRow}
              onPress={() => setJoueurSelectionne(item)}
            >
              <Text style={styles.joueurNom}>
                {item.prenom} {item.nom ?? ''}
              </Text>
              <Text
                style={[
                  styles.badge,
                  item.statut_acces_service === 'actif'
                    ? styles.badgeActif
                    : styles.badgeEnAttente,
                ]}
              >
                {item.statut_acces_service === 'actif' ? 'Actif' : 'En attente'}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

      <Text style={styles.sectionTitle}>Ajouter un joueur</Text>

      <TextInput
        style={styles.input}
        placeholder="Prénom"
        placeholderTextColor="#A8A29E"
        value={prenom}
        onChangeText={setPrenom}
      />
      <TextInput
        style={styles.input}
        placeholder="Nom (optionnel)"
        placeholderTextColor="#A8A29E"
        value={nom}
        onChangeText={setNom}
      />
      <TextInput
        style={styles.input}
        placeholder="Date de naissance (AAAA-MM-JJ)"
        placeholderTextColor="#A8A29E"
        value={dateNaissance}
        onChangeText={setDateNaissance}
        keyboardType="numbers-and-punctuation"
      />

      {age !== null && (
        <Text style={styles.ageInfo}>
          {age} ans {estMineur ? '— consentement parental requis' : ''}
        </Text>
      )}

      {estMineur && (
        <TextInput
          style={styles.input}
          placeholder="Email du parent"
          placeholderTextColor="#A8A29E"
          autoCapitalize="none"
          keyboardType="email-address"
          value={emailParent}
          onChangeText={setEmailParent}
        />
      )}

      <TouchableOpacity
        style={styles.button}
        onPress={handleAjouterJoueur}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Ajouter</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#FAFAF8' },
  title: { fontSize: 22, fontWeight: '700', color: '#1C1917', marginBottom: 12 },
  list: { maxHeight: 200, marginBottom: 8 },
  empty: { color: '#78716C', fontStyle: 'italic', paddingVertical: 8 },
  joueurRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E7E5E4',
  },
  joueurNom: { fontSize: 16, color: '#1C1917' },
  badge: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  badgeActif: { backgroundColor: '#DCFCE7', color: '#166534' },
  badgeEnAttente: { backgroundColor: '#FEF3C7', color: '#92400E' },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1917',
    marginTop: 16,
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E7E5E4',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1C1917',
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
  },
  ageInfo: { fontSize: 13, color: '#92400E', marginBottom: 10 },
  button: {
    backgroundColor: '#EA580C',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});