import { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import JoueursScreen from './components/JoueursScreen';
import PremiereConnexionJoueur from './components/PremiereConnexionJoueur';
import EspaceJoueur from './components/EspaceJoueur';

type TypeUtilisateur = 'inconnu' | 'coach' | 'joueur';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Sur l'écran non connecté : est-on en train de faire le parcours joueur ?
  const [modeJoueur, setModeJoueur] = useState(false);

  // Une fois connecté : coach ou joueur ? (le temps de vérifier en base)
  const [typeUtilisateur, setTypeUtilisateur] = useState<TypeUtilisateur>('inconnu');
  const [verificationType, setVerificationType] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Dès qu'une session existe, on détermine si c'est un coach ou un joueur
  useEffect(() => {
    async function determinerType() {
      if (!session) {
        setTypeUtilisateur('inconnu');
        return;
      }
      setVerificationType(true);
      const { data, error } = await supabase
        .from('joueurs')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      setVerificationType(false);

      if (error) {
        // En cas de doute, on ne suppose rien : on traite comme coach par défaut
        // (comportement historique) mais on pourra affiner plus tard.
        setTypeUtilisateur('coach');
        return;
      }
      setTypeUtilisateur(data ? 'joueur' : 'coach');
    }
    determinerType();
  }, [session]);

  async function handleSignUp() {
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert('Erreur à l\'inscription', error.message);
    } else {
      Alert.alert(
        'Compte créé',
        'Vérifiez votre email pour confirmer votre compte (sauf si la confirmation est désactivée sur le projet).'
      );
    }
  }

  async function handleSignIn() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert('Erreur à la connexion', error.message);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  // ---------- Utilisateur connecté ----------
  if (session) {
    // Le temps de savoir si c'est un coach ou un joueur
    if (verificationType || typeUtilisateur === 'inconnu') {
      return (
        <View style={styles.centre}>
          <StatusBar style="dark" />
          <ActivityIndicator size="large" color="#EA580C" />
        </View>
      );
    }

    return (
      <View style={styles.connectedContainer}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <Text style={styles.headerEmail}>{session.user.email}</Text>
          <TouchableOpacity onPress={handleSignOut}>
            <Text style={styles.headerSignOut}>Déconnexion</Text>
          </TouchableOpacity>
        </View>

        {typeUtilisateur === 'coach' ? (
          <JoueursScreen coachId={session.user.id} />
        ) : (
          <EspaceJoueur authUserId={session.user.id} />
        )}
      </View>
    );
  }

  // ---------- Écran non connecté : parcours joueur ----------
  if (modeJoueur) {
    return (
      <PremiereConnexionJoueur
        onRetour={() => setModeJoueur(false)}
        onCompteLie={() => setTypeUtilisateur('joueur')}
      />
    );
  }

  // ---------- Écran non connecté : accueil + choix ----------
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Text style={styles.title}>Espace coach</Text>
      <Text style={styles.subtitle}>Connectez-vous ou créez votre compte</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#A8A29E"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Mot de passe"
        placeholderTextColor="#A8A29E"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {loading ? (
        <ActivityIndicator size="large" color="#EA580C" style={{ marginTop: 24 }} />
      ) : (
        <>
          <TouchableOpacity style={styles.buttonPrimary} onPress={handleSignIn}>
            <Text style={styles.buttonPrimaryText}>Se connecter</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.buttonSecondary} onPress={handleSignUp}>
            <Text style={styles.buttonSecondaryText}>Créer un compte coach</Text>
          </TouchableOpacity>

          <View style={styles.separateur} />

          <TouchableOpacity style={styles.buttonJoueur} onPress={() => setModeJoueur(true)}>
            <Text style={styles.buttonJoueurText}>Je suis un joueur (j'ai un code)</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAF8' },
  connectedContainer: { flex: 1, backgroundColor: '#FAFAF8' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E7E5E4',
    backgroundColor: '#FFFFFF',
  },
  headerEmail: { fontSize: 13, color: '#78716C' },
  headerSignOut: { fontSize: 13, color: '#EA580C', fontWeight: '600' },
  attenteJoueur: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  attenteTitre: { fontSize: 22, fontWeight: '700', color: '#16A34A', marginBottom: 12, textAlign: 'center' },
  attenteTexte: { fontSize: 15, color: '#57534E', lineHeight: 22, textAlign: 'center' },
  container: {
    flex: 1,
    backgroundColor: '#FAFAF8',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1917',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: '#78716C',
    marginBottom: 32,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E7E5E4',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1C1917',
    backgroundColor: '#FFFFFF',
    marginBottom: 14,
  },
  buttonPrimary: {
    backgroundColor: '#EA580C',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondary: {
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonSecondaryText: {
    color: '#78716C',
    fontSize: 15,
    fontWeight: '500',
  },
  separateur: {
    height: 1,
    backgroundColor: '#E7E5E4',
    marginVertical: 20,
  },
  buttonJoueur: {
    borderWidth: 1,
    borderColor: '#EA580C',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonJoueurText: {
    color: '#EA580C',
    fontSize: 15,
    fontWeight: '600',
  },
});