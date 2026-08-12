-- Symétrique aux policies joueur_lit_larbre_de_son_coach déjà en place sur
-- skill_trees/piliers/briques : permet à un joueur authentifié de lire les
-- exercices rattachés au skill tree de SON coach (peu importe le statut
-- verrouillé/débloqué de la brique -- le filtrage d'accès à l'écran
-- détail se fait côté app, pas côté RLS, exactement comme pour l'arbre).
create policy "joueur_lit_exercices_de_son_coach"
on public.exercices
for select
to authenticated
using (
  coach_id in (
    select j.coach_id from public.joueurs j where j.auth_user_id = auth.uid()
  )
);