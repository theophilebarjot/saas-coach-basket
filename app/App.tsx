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

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

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

  if (session) {
    return (
      <View style={styles.connectedContainer}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <Text style={styles.headerEmail}>{session.user.email}</Text>
          <TouchableOpacity onPress={handleSignOut}>
            <Text style={styles.headerSignOut}>Déconnexion</Text>
          </TouchableOpacity>
        </View>
        <JoueursScreen coachId={session.user.id} />
      </View>
    );
  }

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
            <Text style={styles.buttonSecondaryText}>Créer un compte</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
});