-- Symétrique à "coach_met_a_jour_ses_videos" : permet à un joueur authentifié
-- de finaliser (statut_upload='termine') ou signaler l'échec de SES PROPRES
-- vidéos d'exécution. Sans cette policy, l'UPDATE depuis le client échoue
-- silencieusement côté RLS et statut_upload reste bloqué à 'en_attente'.
create policy "joueur_met_a_jour_ses_videos"
on public.videos
for update
to authenticated
using (
  uploaded_by_joueur_id in (
    select id from public.joueurs where auth_user_id = auth.uid()
  )
)
with check (
  uploaded_by_joueur_id in (
    select id from public.joueurs where auth_user_id = auth.uid()
  )
);