// components/SoumissionsAValiderScreen.tsx

import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert, Linking } from 'react-native';
import { supabase } from '../lib/supabase';
import { obtenirUrlVisionnageSoumission } from '../lib/uploadSoumissionVideo';

type SoumissionAValider = {
  id: string;
  date_soumission: string;
  joueurPrenom: string;
  joueurNom: string | null;
  exerciceNom: string;
  exerciceNiveau: string | null;
  seanceTitre: string;
};

export default function SoumissionsAValiderScreen() {
  const [soumissions, setSoumissions] = useState<SoumissionAValider[]>([]);
  const [loading, setLoading] = useState(true);
  const [soumissionOuverte, setSoumissionOuverte] = useState<string | null>(null);
  const [texteFeedback, setTexteFeedback] = useState('');
  const [chargementLecture, setChargementLecture] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  async function chargerSoumissions() {
    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }
    const coachId = session.user.id;

    const { data, error } = await supabase
      .from('soumissions')
      .select(`
        id,
        date_soumission,
        video_id,
        joueurs ( prenom, nom, coach_id ),
        seances_exercices (
          exercices ( nom, niveau ),
          seances ( titre )
        ),
        videos ( statut_upload )
      `)
      .eq('statut', 'en_attente')
      .not('video_id', 'is', null)
      .order('date_soumission', { ascending: true });

    if (error) {
      Alert.alert('Erreur', error.message);
      setLoading(false);
      return;
    }

    const formatees: SoumissionAValider[] = ((data ?? []) as any[])
      .map((s) => {
        // Les relations imbriquées peuvent revenir en objet unique ou en
        // tableau selon le cas -- on gère les deux systématiquement.
        const joueur = Array.isArray(s.joueurs) ? s.joueurs[0] : s.joueurs;
        const seanceExercice = Array.isArray(s.seances_exercices) ? s.seances_exercices[0] : s.seances_exercices;
        const exercice = seanceExercice ? (Array.isArray(seanceExercice.exercices) ? seanceExercice.exercices[0] : seanceExercice.exercices) : null;
        const seance = seanceExercice ? (Array.isArray(seanceExercice.seances) ? seanceExercice.seances[0] : seanceExercice.seances) : null;
        const video = Array.isArray(s.videos) ? s.videos[0] : s.videos;

        return {
          id: s.id,
          date_soumission: s.date_soumission,
          joueurPrenom: joueur?.prenom ?? '?',
          joueurNom: joueur?.nom ?? null,
          joueurCoachId: joueur?.coach_id ?? null,
          exerciceNom: exercice?.nom ?? 'Exercice',
          exerciceNiveau: exercice?.niveau ?? null,
          seanceTitre: seance?.titre ?? 'Séance',
          videoStatutUpload: video?.statut_upload ?? null,
        };
      })
      // Sécurité côté client : ne garder que les vidéos réellement uploadées
      // et appartenant bien à un joueur de ce coach.
      .filter((s: any) => s.videoStatutUpload === 'termine' && s.joueurCoachId === coachId);

    setSoumissions(formatees);
    setLoading(false);
  }

  useEffect(() => {
    chargerSoumissions();
  }, []);

  function ouvrirSoumission(id: string) {
    if (soumissionOuverte === id) {
      setSoumissionOuverte(null);
    } else {
      setSoumissionOuverte(id);
      setTexteFeedback('');
    }
  }

  async function voirLaVideo(soumissionId: string) {
    setChargementLecture(true);
    const url = await obtenirUrlVisionnageSoumission(soumissionId);
    setChargementLecture(false);
    if (!url) {
      Alert.alert('Erreur', "Impossible de charger la vidéo pour l'instant.");
      return;
    }
    Linking.openURL(url);
  }

  async function traiterSoumission(soumissionId: string, nouveauStatut: 'validee' | 'refusee') {
    if (nouveauStatut === 'refusee' && !texteFeedback.trim()) {
      Alert.alert('Explication requise', "Précise ce que le joueur doit corriger avant de renvoyer la séance.");
      return;
    }

    setEnvoiEnCours(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setEnvoiEnCours(false);
      return;
    }
    const coachId = session.user.id;

    if (texteFeedback.trim()) {
      const { error: feedbackError } = await supabase.from('feedbacks').insert({
        soumission_id: soumissionId,
        coach_id: coachId,
        type: 'texte',
        contenu_texte: texteFeedback.trim(),
      });
      if (feedbackError) {
        setEnvoiEnCours(false);
        Alert.alert('Erreur', "Le feedback n'a pas pu être enregistré : " + feedbackError.message);
        return;
      }
    }

    const { error: majError } = await supabase
      .from('soumissions')
      .update({
        statut: nouveauStatut,
        validee_par_coach_id: coachId,
        date_validation: new Date().toISOString(),
      })
      .eq('id', soumissionId);

    setEnvoiEnCours(false);

    if (majError) {
      Alert.alert('Erreur', "Le statut n'a pas pu être mis à jour : " + majError.message);
      return;
    }

    setSoumissionOuverte(null);
    setTexteFeedback('');
    chargerSoumissions();
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
      <Text style={styles.title}>Soumissions à valider</Text>

      <ScrollView style={styles.scroll}>
        {soumissions.length === 0 && (
          <Text style={styles.empty}>Aucune soumission en attente. 🎉</Text>
        )}

        {soumissions.map((s) => {
          const estOuverte = soumissionOuverte === s.id;
          return (
            <View key={s.id} style={styles.carte}>
              <TouchableOpacity onPress={() => ouvrirSoumission(s.id)} style={styles.entete}>
                <View style={styles.entetInfo}>
                  <Text style={styles.joueurNom}>
                    {s.joueurPrenom} {s.joueurNom ?? ''}
                  </Text>
                  <Text style={styles.details}>
                    {s.seanceTitre} · {s.exerciceNom}
                    {s.exerciceNiveau ? ` (${s.exerciceNiveau})` : ''}
                  </Text>
                </View>
                <Text style={styles.chevron}>{estOuverte ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {estOuverte && (
                <View style={styles.detailZone}>
                  <TouchableOpacity
                    style={styles.boutonVoir}
                    onPress={() => voirLaVideo(s.id)}
                    disabled={chargementLecture}
                  >
                    {chargementLecture ? (
                      <ActivityIndicator size="small" color="#EA580C" />
                    ) : (
                      <Text style={styles.texteBoutonVoir}>▶ Voir la vidéo</Text>
                    )}
                  </TouchableOpacity>

                  <TextInput
                    style={styles.input}
                    placeholder="Ton commentaire pour le joueur (optionnel si validé)"
                    placeholderTextColor="#A8A29E"
                    multiline
                    value={texteFeedback}
                    onChangeText={setTexteFeedback}
                  />

                  <View style={styles.boutonsAction}>
                    <TouchableOpacity
                      style={styles.boutonRefuser}
                      onPress={() => traiterSoumission(s.id, 'refusee')}
                      disabled={envoiEnCours}
                    >
                      <Text style={styles.texteBoutonRefuser}>À refaire</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.boutonValider}
                      onPress={() => traiterSoumission(s.id, 'validee')}
                      disabled={envoiEnCours}
                    >
                      {envoiEnCours ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.texteBoutonValider}>Valider</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          );
        })}
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
  carte: {
    marginBottom: 12, backgroundColor: '#FFFFFF', borderRadius: 12,
    borderWidth: 1, borderColor: '#E7E5E4', overflow: 'hidden',
  },
  entete: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  entetInfo: { flex: 1 },
  joueurNom: { fontSize: 15, fontWeight: '700', color: '#1C1917' },
  details: { fontSize: 13, color: '#57534E', marginTop: 2 },
  chevron: { fontSize: 12, color: '#A8A29E', marginLeft: 8 },
  detailZone: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: '#F5F5F4', paddingTop: 12 },
  boutonVoir: {
    alignSelf: 'flex-start', backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#EA580C',
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, marginBottom: 12,
  },
  texteBoutonVoir: { color: '#EA580C', fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: '#E7E5E4', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    color: '#1C1917', backgroundColor: '#FAFAF8', marginBottom: 12,
    minHeight: 70, textAlignVertical: 'top',
  },
  boutonsAction: { flexDirection: 'row', gap: 10 },
  boutonRefuser: {
    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#DC2626',
  },
  texteBoutonRefuser: { color: '#DC2626', fontSize: 14, fontWeight: '600' },
  boutonValider: {
    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#16A34A',
  },
  texteBoutonValider: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});