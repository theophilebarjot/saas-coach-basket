// components/EspaceJoueur.tsx

import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Switch, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import MonArbreJoueur from './MonArbreJoueur';
import MesSeancesJoueur from './MesSeancesJoueur';

type JoueurInfo = {
  id: string;
  prenom: string;
  email_parent: string | null;
  statut_acces_service: string;
  coach_id: string;
};

type OngletActif = 'arbre' | 'seances';

export default function EspaceJoueur({ authUserId }: { authUserId: string }) {
  const [joueur, setJoueur] = useState<JoueurInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailParent, setEmailParent] = useState('');
  const [caseCochee, setCaseCochee] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [onglet, setOnglet] = useState<OngletActif>('arbre');

  async function chargerJoueur() {
    setLoading(true);
    const { data, error } = await supabase
      .from('joueurs')
      .select('id, prenom, email_parent, statut_acces_service, coach_id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if (!error) setJoueur(data);
    setLoading(false);
  }

  useEffect(() => {
    chargerJoueur();
  }, []);

  async function soumettreConsentement() {
    if (!joueur) return;
    if (!emailParent.trim() || !emailParent.includes('@')) {
      Alert.alert('Email invalide', "Renseigne une adresse email valide pour ton parent.");
      return;
    }
    if (!caseCochee) {
      Alert.alert('Case à cocher requise', 'Tu dois cocher la case pour confirmer ton accord.');
      return;
    }

    setEnvoiEnCours(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setEnvoiEnCours(false);
      return;
    }

    const reponse = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/envoyer-consentement-parental`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ joueur_id: joueur.id, email_parent: emailParent.trim() }),
      }
    );

    setEnvoiEnCours(false);

    if (!reponse.ok) {
      const detail = await reponse.json().catch(() => ({}));
      Alert.alert('Erreur', detail.error ?? "L'envoi n'a pas pu se faire.");
      return;
    }

    Alert.alert(
      'Email envoyé !',
      "Un email a été envoyé à ton parent. Dès qu'il aura confirmé, ton accès sera activé."
    );
    chargerJoueur();
  }

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color="#EA580C" />
      </View>
    );
  }

  if (!joueur) {
    return (
      <View style={styles.centre}>
        <Text style={styles.texteAttente}>Profil introuvable.</Text>
      </View>
    );
  }

  if (joueur.statut_acces_service === 'actif') {
    return (
      <View style={styles.containerActif}>
        <View style={styles.menu}>
          <TouchableOpacity
            style={[styles.ongletBouton, onglet === 'arbre' && styles.ongletBoutonActif]}
            onPress={() => setOnglet('arbre')}
          >
            <Text style={[styles.ongletTexte, onglet === 'arbre' && styles.ongletTexteActif]}>
              Mon arbre
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ongletBouton, onglet === 'seances' && styles.ongletBoutonActif]}
            onPress={() => setOnglet('seances')}
          >
            <Text style={[styles.ongletTexte, onglet === 'seances' && styles.ongletTexteActif]}>
              Mes séances
            </Text>
          </TouchableOpacity>
        </View>

        {onglet === 'arbre' ? (
          <MonArbreJoueur authUserId={authUserId} joueurId={joueur.id} coachId={joueur.coach_id} />
        ) : (
          <MesSeancesJoueur joueurId={joueur.id} />
        )}
      </View>
    );
  }

  if (joueur.email_parent) {
    return (
      <View style={styles.centre}>
        <Text style={styles.titreAttente}>En attente de validation</Text>
        <Text style={styles.texteAttente}>
          Ton accord est enregistré. On attend maintenant que ton parent confirme
          via l'email qui lui a été envoyé.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titre}>Bonjour {joueur.prenom} 👋</Text>
      <Text style={styles.intro}>
        Pour utiliser l'application, on a besoin de l'accord d'un de tes parents.
        Renseigne son email ci-dessous : il recevra un message pour confirmer.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Email de ton parent"
        placeholderTextColor="#A8A29E"
        autoCapitalize="none"
        keyboardType="email-address"
        value={emailParent}
        onChangeText={setEmailParent}
      />

      <View style={styles.ligneCheckbox}>
        <Switch value={caseCochee} onValueChange={setCaseCochee} trackColor={{ true: '#EA580C' }} />
        <Text style={styles.texteCheckbox}>
          Je confirme vouloir utiliser cette application pour suivre ma progression.
        </Text>
      </View>

      <TouchableOpacity style={styles.bouton} onPress={soumettreConsentement} disabled={envoiEnCours}>
        {envoiEnCours ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.boutonTexte}>Envoyer</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  container: { flex: 1, padding: 24, paddingTop: 40 },
  containerActif: { flex: 1, backgroundColor: '#FAFAF8' },
  menu: {
    flexDirection: 'row', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4,
    gap: 8, backgroundColor: '#FAFAF8',
  },
  ongletBouton: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#F5F5F4', borderWidth: 1, borderColor: '#E7E5E4',
  },
  ongletBoutonActif: { backgroundColor: '#EA580C', borderColor: '#EA580C' },
  ongletTexte: { fontSize: 13, fontWeight: '600', color: '#57534E' },
  ongletTexteActif: { color: '#FFFFFF' },
  titre: { fontSize: 22, fontWeight: '700', color: '#1C1917', marginBottom: 8 },
  intro: { fontSize: 14, color: '#57534E', marginBottom: 20, lineHeight: 20 },
  input: {
    borderWidth: 1, borderColor: '#E7E5E4', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    color: '#1C1917', backgroundColor: '#FFFFFF', marginBottom: 16,
  },
  ligneCheckbox: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 10 },
  texteCheckbox: { flex: 1, fontSize: 13, color: '#57534E', lineHeight: 18 },
  bouton: { backgroundColor: '#EA580C', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  boutonTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  titreSucces: { fontSize: 22, fontWeight: '700', color: '#16A34A', marginBottom: 12, textAlign: 'center' },
  titreAttente: { fontSize: 20, fontWeight: '700', color: '#92400E', marginBottom: 12, textAlign: 'center' },
  texteAttente: { fontSize: 15, color: '#57534E', lineHeight: 22, textAlign: 'center' },
});