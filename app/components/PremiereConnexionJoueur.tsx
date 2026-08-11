// components/PremiereConnexionJoueur.tsx

import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../lib/supabase';

export default function PremiereConnexionJoueur({
  onRetour,
  onCompteLie,
}: {
  onRetour: () => void;
  onCompteLie: () => void;
}) {
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function creerCompteEtLier() {
    if (!code.trim() || !email.trim() || !motDePasse.trim()) {
      Alert.alert('Champs manquants', 'Le code, l\'email et le mot de passe sont tous nécessaires.');
      return;
    }
    if (motDePasse.length < 6) {
      Alert.alert('Mot de passe trop court', 'Le mot de passe doit faire au moins 6 caractères.');
      return;
    }

    setEnCours(true);

    // 1. Créer le compte joueur
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password: motDePasse,
      options: { data: { role: 'joueur' } },
    });

    if (signUpError) {
      setEnCours(false);
      Alert.alert('Erreur de création de compte', signUpError.message);
      return;
    }

    // 2. Récupérer le JWT tout juste créé
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setEnCours(false);
      Alert.alert('Erreur', 'Session non disponible après la création du compte.');
      return;
    }

    // 3. Appeler l'Edge Function de liaison
    const reponse = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/lier-compte-joueur`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code_invitation: code.trim() }),
      }
    );

    setEnCours(false);

    if (!reponse.ok) {
      const detail = await reponse.json().catch(() => ({}));
      Alert.alert('Liaison impossible', detail.error ?? 'Le code n\'a pas pu être vérifié.');
      return;
    }

    const { prenom } = await reponse.json();
    onCompteLie();
    Alert.alert(
      'Compte lié !',
      `Bienvenue ${prenom ?? ''} ! Ton compte est bien relié à ta fiche. La prochaine étape (consentement) arrivera bientôt.`
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onRetour}>
        <Text style={styles.retour}>← Retour</Text>
      </TouchableOpacity>

      <Text style={styles.titre}>Première connexion joueur</Text>
      <Text style={styles.intro}>
        Saisis le code que ton coach t'a communiqué, puis crée ton compte.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Code d'invitation (ex. X7K9QM)"
        placeholderTextColor="#A8A29E"
        autoCapitalize="characters"
        value={code}
        onChangeText={setCode}
      />
      <TextInput
        style={styles.input}
        placeholder="Ton email"
        placeholderTextColor="#A8A29E"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Choisis un mot de passe (6 caractères min.)"
        placeholderTextColor="#A8A29E"
        secureTextEntry
        value={motDePasse}
        onChangeText={setMotDePasse}
      />

      <TouchableOpacity style={styles.bouton} onPress={creerCompteEtLier} disabled={enCours}>
        {enCours ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.boutonTexte}>Créer mon compte</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#FAFAF8' },
  retour: { color: '#EA580C', fontWeight: '600', marginBottom: 16 },
  titre: { fontSize: 22, fontWeight: '700', color: '#1C1917', marginBottom: 8 },
  intro: { fontSize: 14, color: '#57534E', marginBottom: 20, lineHeight: 20 },
  input: {
    borderWidth: 1, borderColor: '#E7E5E4', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    color: '#1C1917', backgroundColor: '#FFFFFF', marginBottom: 12,
  },
  bouton: { backgroundColor: '#EA580C', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  boutonTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});