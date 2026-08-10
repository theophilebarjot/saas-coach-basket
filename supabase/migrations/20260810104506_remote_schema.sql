-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.appliquer_consentement (
  p_joueur_id            uuid,
  p_type                 text,
  p_partie               text,
  p_action               text,
  p_version_texte        text,
  p_methode_verification text DEFAULT NULL::text,
  p_token_hash           text DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_statut_parent text;
  v_statut_joueur text;
  v_nouveau_statut text;
begin
  insert into consentements (
    joueur_id, type_consentement, partie, action,
    version_texte, methode_verification, token_hash
  ) values (
    p_joueur_id, p_type, p_partie, p_action,
    p_version_texte, p_methode_verification, p_token_hash
  );

  v_statut_parent := dernier_statut_partie(p_joueur_id, p_type, 'parent');
  v_statut_joueur := dernier_statut_partie(p_joueur_id, p_type, 'joueur');

  if v_statut_parent = 'retire' or v_statut_joueur = 'retire' then
    v_nouveau_statut := 'retire';
  elsif v_statut_parent = 'accepte' and v_statut_joueur = 'accepte' then
    v_nouveau_statut := 'actif';
  else
    v_nouveau_statut := 'en_attente';
  end if;

  if p_type = 'acces_service' then
    update joueurs set statut_acces_service = v_nouveau_statut
    where id = p_joueur_id;
  elsif p_type = 'captation_image' then
    update joueurs set statut_captation_image = v_nouveau_statut
    where id = p_joueur_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.appliquer_consentement (
  p_joueur_id      uuid,
  p_type           text,
  p_nouveau_statut text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if p_type = 'acces_service' then
    update joueurs set statut_acces_service = p_nouveau_statut
    where id = p_joueur_id;
  elsif p_type = 'captation_image' then
    update joueurs set statut_captation_image = p_nouveau_statut
    where id = p_joueur_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cloner_modele_skill_tree (
  p_coach_id  uuid,
  p_modele_id uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  AS $function$
declare
  v_nouveau_skill_tree_id uuid;
  v_nouveau_pilier_id uuid;
  r_pilier record;
  r_brique record;
begin
  insert into skill_trees (coach_id, origine_modele_id, nom)
  select p_coach_id, id, nom from skill_trees where id = p_modele_id
  returning id into v_nouveau_skill_tree_id;

  for r_pilier in
    select * from piliers where skill_tree_id = p_modele_id order by ordre
  loop
    insert into piliers (skill_tree_id, nom, ordre)
    values (v_nouveau_skill_tree_id, r_pilier.nom, r_pilier.ordre)
    returning id into v_nouveau_pilier_id;

    for r_brique in
      select * from briques where pilier_id = r_pilier.id order by ordre
    loop
      insert into briques (pilier_id, nom, video_demo_id, est_personnalisee, ordre)
      values (v_nouveau_pilier_id, r_brique.nom, r_brique.video_demo_id, false, r_brique.ordre);
    end loop;
  end loop;

  return v_nouveau_skill_tree_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.dernier_statut_partie (
  p_joueur_id uuid,
  p_type      text,
  p_partie    text
)
  RETURNS text
  LANGUAGE sql
  STABLE
  AS $function$
  select action from consentements
  where joueur_id = p_joueur_id
    and type_consentement = p_type
    and partie = p_partie
  order by date_heure desc
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_coach()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  insert into public.coaches (id, email)
  values (new.id, new.email);

  perform public.cloner_modele_skill_tree(
    new.id, '00000000-0000-0000-0000-000000000001'
  );

  return new;
end;
$function$;

CREATE TABLE public.briques_debloquees (
  id                     uuid                     DEFAULT gen_random_uuid() NOT NULL,
  joueur_id              uuid                     NOT NULL,
  brique_id              uuid                     NOT NULL,
  date_deblocage         timestamp with time zone DEFAULT now() NOT NULL,
  debloquee_par_coach_id uuid
);

ALTER TABLE public.briques_debloquees
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.briques_debloquees
  ADD CONSTRAINT briques_debloquees_brique_id_fkey FOREIGN KEY (brique_id) REFERENCES public.briques(id) ON DELETE CASCADE;

ALTER TABLE public.briques_debloquees
  ADD CONSTRAINT briques_debloquees_debloquee_par_coach_id_fkey FOREIGN KEY (debloquee_par_coach_id) REFERENCES public.coaches(id);

ALTER TABLE public.briques_debloquees
  ADD CONSTRAINT briques_debloquees_joueur_id_brique_id_key UNIQUE (joueur_id, brique_id);

ALTER TABLE public.briques_debloquees
  ADD CONSTRAINT briques_debloquees_joueur_id_fkey FOREIGN KEY (joueur_id) REFERENCES public.joueurs(id) ON DELETE CASCADE;

ALTER TABLE public.briques_debloquees
  ADD CONSTRAINT briques_debloquees_pkey PRIMARY KEY (id);

GRANT ALL ON public.briques_debloquees TO anon;

GRANT ALL ON public.briques_debloquees TO authenticated;

GRANT ALL ON public.briques_debloquees TO service_role;

CREATE POLICY coach_gere_briques_debloquees_de_ses_joueurs ON public.briques_debloquees
  USING ((EXISTS ( SELECT 1
   FROM public.joueurs j
  WHERE ((j.id = briques_debloquees.joueur_id) AND (j.coach_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.joueurs j
  WHERE ((j.id = briques_debloquees.joueur_id) AND (j.coach_id = auth.uid())))));

CREATE POLICY joueur_lit_ses_briques_debloquees ON public.briques_debloquees
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM public.joueurs j
  WHERE ((j.id = briques_debloquees.joueur_id) AND (j.auth_user_id = auth.uid())))));
