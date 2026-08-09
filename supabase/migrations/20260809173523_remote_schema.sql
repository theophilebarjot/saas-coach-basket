-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP EXTENSION pg_net;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;

CREATE FUNCTION public.appliquer_consentement (
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

GRANT ALL ON FUNCTION public.appliquer_consentement(uuid, text, text, text, text, text, text) TO anon;

GRANT ALL ON FUNCTION public.appliquer_consentement(uuid, text, text, text, text, text, text) TO authenticated;

GRANT ALL ON FUNCTION public.appliquer_consentement(uuid, text, text, text, text, text, text) TO service_role;

CREATE FUNCTION public.appliquer_consentement (
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

GRANT ALL ON FUNCTION public.appliquer_consentement(uuid, text, text) TO anon;

GRANT ALL ON FUNCTION public.appliquer_consentement(uuid, text, text) TO authenticated;

GRANT ALL ON FUNCTION public.appliquer_consentement(uuid, text, text) TO service_role;

CREATE FUNCTION public.cloner_modele_skill_tree (
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

GRANT ALL ON FUNCTION public.cloner_modele_skill_tree(uuid, uuid) TO anon;

GRANT ALL ON FUNCTION public.cloner_modele_skill_tree(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.cloner_modele_skill_tree(uuid, uuid) TO service_role;

CREATE FUNCTION public.dernier_statut_partie (
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

GRANT ALL ON FUNCTION public.dernier_statut_partie(uuid, text, text) TO anon;

GRANT ALL ON FUNCTION public.dernier_statut_partie(uuid, text, text) TO authenticated;

GRANT ALL ON FUNCTION public.dernier_statut_partie(uuid, text, text) TO service_role;

CREATE FUNCTION public.handle_new_coach()
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_coach();

GRANT ALL ON FUNCTION public.handle_new_coach() TO anon;

GRANT ALL ON FUNCTION public.handle_new_coach() TO authenticated;

GRANT ALL ON FUNCTION public.handle_new_coach() TO service_role;

CREATE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

GRANT ALL ON FUNCTION public.rls_auto_enable() TO anon;

GRANT ALL ON FUNCTION public.rls_auto_enable() TO authenticated;

GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;

CREATE TABLE public.abonnements (
  id                     uuid                     DEFAULT gen_random_uuid() NOT NULL,
  coach_id               uuid                     NOT NULL,
  plan                   text,
  statut                 text                     DEFAULT 'essai'::text NOT NULL,
  stripe_customer_id     text,
  stripe_subscription_id text,
  date_debut             timestamp with time zone,
  date_fin               timestamp with time zone
);

ALTER TABLE public.abonnements
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.abonnements
  ADD CONSTRAINT abonnements_coach_id_key UNIQUE (coach_id);

ALTER TABLE public.abonnements
  ADD CONSTRAINT abonnements_pkey PRIMARY KEY (id);

ALTER TABLE public.abonnements
  ADD CONSTRAINT abonnements_statut_check CHECK (statut = ANY (ARRAY['essai'::text, 'actif'::text, 'impaye'::text, 'annule'::text]));

GRANT ALL ON public.abonnements TO anon;

GRANT ALL ON public.abonnements TO authenticated;

GRANT ALL ON public.abonnements TO service_role;

CREATE POLICY coach_lit_son_abonnement ON public.abonnements
  FOR SELECT
  USING ((coach_id = auth.uid()));

CREATE TABLE public.briques (
  id                uuid    DEFAULT gen_random_uuid() NOT NULL,
  pilier_id         uuid    NOT NULL,
  nom               text    NOT NULL,
  video_demo_id     uuid,
  est_personnalisee boolean DEFAULT false NOT NULL,
  ordre             integer DEFAULT 0 NOT NULL
);

ALTER TABLE public.briques
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.briques
  ADD CONSTRAINT briques_pkey PRIMARY KEY (id);

GRANT ALL ON public.briques TO anon;

GRANT ALL ON public.briques TO authenticated;

GRANT ALL ON public.briques TO service_role;

CREATE TABLE public.coaches (
  id                uuid                     NOT NULL,
  email             text                     NOT NULL,
  statut_abonnement text                     DEFAULT 'essai'::text NOT NULL,
  cree_le           timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.coaches
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.coaches
  ADD CONSTRAINT coaches_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.coaches
  ADD CONSTRAINT coaches_pkey PRIMARY KEY (id);

ALTER TABLE public.abonnements
  ADD CONSTRAINT abonnements_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.coaches(id) ON DELETE CASCADE;

ALTER TABLE public.coaches
  ADD CONSTRAINT coaches_statut_abonnement_check CHECK (statut_abonnement = ANY (ARRAY['essai'::text, 'actif'::text, 'impaye'::text, 'annule'::text]));

GRANT ALL ON public.coaches TO anon;

GRANT ALL ON public.coaches TO authenticated;

GRANT ALL ON public.coaches TO service_role;

CREATE POLICY coach_lit_sa_propre_ligne ON public.coaches
  FOR SELECT
  USING ((id = auth.uid()));

CREATE POLICY coach_modifie_sa_propre_ligne ON public.coaches
  FOR UPDATE
  USING ((id = auth.uid()))
  WITH CHECK ((id = auth.uid()));

CREATE TABLE public.consentements (
  id                   uuid                     DEFAULT gen_random_uuid() NOT NULL,
  joueur_id            uuid                     NOT NULL,
  type_consentement    text                     NOT NULL,
  partie               text                     NOT NULL,
  action               text                     NOT NULL,
  date_heure           timestamp with time zone DEFAULT now() NOT NULL,
  version_texte        text                     NOT NULL,
  methode_verification text,
  token_hash           text,
  cree_le              timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.consentements
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.consentements
  ADD CONSTRAINT consentements_action_check CHECK (action = ANY (ARRAY['accepte'::text, 'retire'::text]));

ALTER TABLE public.consentements
  ADD CONSTRAINT consentements_partie_check CHECK (partie = ANY (ARRAY['parent'::text, 'joueur'::text]));

ALTER TABLE public.consentements
  ADD CONSTRAINT consentements_pkey PRIMARY KEY (id);

ALTER TABLE public.consentements
  ADD CONSTRAINT consentements_type_consentement_check CHECK (type_consentement = ANY (ARRAY['acces_service'::text, 'captation_image'::text]));

GRANT ALL ON public.consentements TO anon;

GRANT ALL ON public.consentements TO authenticated;

GRANT ALL ON public.consentements TO service_role;

CREATE TABLE public.exercices (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  coach_id      uuid,
  brique_id     uuid,
  video_demo_id uuid,
  nom           text                     NOT NULL,
  description   text,
  cree_le       timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.exercices
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.exercices
  ADD CONSTRAINT exercices_brique_id_fkey FOREIGN KEY (brique_id) REFERENCES public.briques(id);

ALTER TABLE public.exercices
  ADD CONSTRAINT exercices_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.coaches(id) ON DELETE CASCADE;

ALTER TABLE public.exercices
  ADD CONSTRAINT exercices_pkey PRIMARY KEY (id);

GRANT ALL ON public.exercices TO anon;

GRANT ALL ON public.exercices TO authenticated;

GRANT ALL ON public.exercices TO service_role;

CREATE POLICY coach_gere_ses_exercices ON public.exercices
  USING ((coach_id = auth.uid()))
  WITH CHECK ((coach_id = auth.uid()));

CREATE POLICY coach_lit_bibliotheque_globale ON public.exercices
  FOR SELECT
  USING ((coach_id IS NULL));

CREATE TABLE public.feedbacks (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  soumission_id   uuid                     NOT NULL,
  coach_id        uuid                     NOT NULL,
  type            text                     NOT NULL,
  contenu_texte   text,
  url_audio       text,
  timestamp_video integer,
  cree_le         timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.feedbacks
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.feedbacks
  ADD CONSTRAINT feedbacks_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.coaches(id);

ALTER TABLE public.feedbacks
  ADD CONSTRAINT feedbacks_pkey PRIMARY KEY (id);

ALTER TABLE public.feedbacks
  ADD CONSTRAINT feedbacks_type_check CHECK (type = ANY (ARRAY['audio'::text, 'texte'::text]));

GRANT ALL ON public.feedbacks TO anon;

GRANT ALL ON public.feedbacks TO authenticated;

GRANT ALL ON public.feedbacks TO service_role;

CREATE POLICY coach_lit_ses_feedbacks ON public.feedbacks
  FOR SELECT
  USING ((coach_id = auth.uid()));

CREATE TABLE public.joueurs (
  id                     uuid                     DEFAULT gen_random_uuid() NOT NULL,
  coach_id               uuid                     NOT NULL,
  auth_user_id           uuid,
  prenom                 text                     NOT NULL,
  nom                    text,
  date_naissance         date                     NOT NULL,
  email_parent           text,
  niveau_initial         text,
  statut_acces_service   text                     DEFAULT 'en_attente'::text NOT NULL,
  statut_captation_image text                     DEFAULT 'en_attente'::text NOT NULL,
  cree_le                timestamp with time zone DEFAULT now() NOT NULL
);

CREATE POLICY coach_lit_consentements_de_ses_joueurs ON public.consentements
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM public.joueurs j
  WHERE ((j.id = consentements.joueur_id) AND (j.coach_id = auth.uid())))));

CREATE POLICY joueur_lit_ses_propres_consentements ON public.consentements
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM public.joueurs j
  WHERE ((j.id = consentements.joueur_id) AND (j.auth_user_id = auth.uid())))));

ALTER TABLE public.joueurs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.joueurs
  ADD CONSTRAINT email_parent_requis_si_mineur CHECK (date_naissance > (CURRENT_DATE - '15 years'::interval) AND email_parent IS
    NOT NULL OR date_naissance <= (CURRENT_DATE - '15 years'::interval));

ALTER TABLE public.joueurs
  ADD CONSTRAINT joueurs_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.joueurs
  ADD CONSTRAINT joueurs_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.coaches(id) ON DELETE CASCADE;

ALTER TABLE public.joueurs
  ADD CONSTRAINT joueurs_pkey PRIMARY KEY (id);

ALTER TABLE public.consentements
  ADD CONSTRAINT consentements_joueur_id_fkey FOREIGN KEY (joueur_id) REFERENCES public.joueurs(id) ON DELETE CASCADE;

ALTER TABLE public.joueurs
  ADD CONSTRAINT joueurs_statut_acces_service_check CHECK (statut_acces_service = ANY (ARRAY['en_attente'::text, 'actif'::text, 'retire'::text]));

ALTER TABLE public.joueurs
  ADD CONSTRAINT joueurs_statut_captation_image_check CHECK (statut_captation_image = ANY (ARRAY['en_attente'::text, 'actif'::text, 'retire'::text]));

GRANT ALL ON public.joueurs TO anon;

GRANT ALL ON public.joueurs TO authenticated;

GRANT ALL ON public.joueurs TO service_role;

CREATE POLICY coach_gere_ses_joueurs ON public.joueurs
  USING ((coach_id = auth.uid()))
  WITH CHECK ((coach_id = auth.uid()));

CREATE POLICY joueur_lit_sa_propre_ligne ON public.joueurs
  FOR SELECT
  USING ((auth_user_id = auth.uid()));

CREATE TABLE public.piliers (
  id            uuid    DEFAULT gen_random_uuid() NOT NULL,
  skill_tree_id uuid    NOT NULL,
  nom           text    NOT NULL,
  ordre         integer DEFAULT 0 NOT NULL
);

ALTER TABLE public.piliers
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.piliers
  ADD CONSTRAINT piliers_pkey PRIMARY KEY (id);

ALTER TABLE public.briques
  ADD CONSTRAINT briques_pilier_id_fkey FOREIGN KEY (pilier_id) REFERENCES public.piliers(id) ON DELETE CASCADE;

GRANT ALL ON public.piliers TO anon;

GRANT ALL ON public.piliers TO authenticated;

GRANT ALL ON public.piliers TO service_role;

CREATE TABLE public.seances (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  joueur_id      uuid                     NOT NULL,
  coach_id       uuid                     NOT NULL,
  titre          text                     NOT NULL,
  date_planifiee date,
  statut         text                     DEFAULT 'planifiee'::text NOT NULL,
  cree_le        timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.seances
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.seances
  ADD CONSTRAINT seances_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.coaches(id) ON DELETE CASCADE;

ALTER TABLE public.seances
  ADD CONSTRAINT seances_joueur_id_fkey FOREIGN KEY (joueur_id) REFERENCES public.joueurs(id) ON DELETE CASCADE;

ALTER TABLE public.seances
  ADD CONSTRAINT seances_pkey PRIMARY KEY (id);

ALTER TABLE public.seances
  ADD CONSTRAINT seances_statut_check CHECK (statut = ANY (ARRAY['planifiee'::text, 'realisee'::text, 'en_attente_controle'::text]));

GRANT ALL ON public.seances TO anon;

GRANT ALL ON public.seances TO authenticated;

GRANT ALL ON public.seances TO service_role;

CREATE POLICY coach_gere_ses_seances ON public.seances
  USING ((coach_id = auth.uid()))
  WITH CHECK ((coach_id = auth.uid()));

CREATE POLICY joueur_lit_ses_seances ON public.seances
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM public.joueurs j
  WHERE ((j.id = seances.joueur_id) AND (j.auth_user_id = auth.uid())))));

CREATE TABLE public.seances_exercices (
  id          uuid    DEFAULT gen_random_uuid() NOT NULL,
  seance_id   uuid    NOT NULL,
  exercice_id uuid    NOT NULL,
  consignes   text,
  ordre       integer DEFAULT 0 NOT NULL
);

ALTER TABLE public.seances_exercices
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.seances_exercices
  ADD CONSTRAINT seances_exercices_exercice_id_fkey FOREIGN KEY (exercice_id) REFERENCES public.exercices(id);

ALTER TABLE public.seances_exercices
  ADD CONSTRAINT seances_exercices_pkey PRIMARY KEY (id);

ALTER TABLE public.seances_exercices
  ADD CONSTRAINT seances_exercices_seance_id_fkey FOREIGN KEY (seance_id) REFERENCES public.seances(id) ON DELETE CASCADE;

GRANT ALL ON public.seances_exercices TO anon;

GRANT ALL ON public.seances_exercices TO authenticated;

GRANT ALL ON public.seances_exercices TO service_role;

CREATE POLICY coach_gere_ses_seances_exercices ON public.seances_exercices
  USING ((EXISTS ( SELECT 1
   FROM public.seances s
  WHERE ((s.id = seances_exercices.seance_id) AND (s.coach_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.seances s
  WHERE ((s.id = seances_exercices.seance_id) AND (s.coach_id = auth.uid())))));

CREATE POLICY joueur_lit_ses_seances_exercices ON public.seances_exercices
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM (public.seances s
     JOIN public.joueurs j ON ((j.id = s.joueur_id)))
  WHERE ((s.id = seances_exercices.seance_id) AND (j.auth_user_id = auth.uid())))));

CREATE TABLE public.skill_trees (
  id                uuid                     DEFAULT gen_random_uuid() NOT NULL,
  coach_id          uuid,
  origine_modele_id uuid,
  nom               text                     NOT NULL,
  cree_le           timestamp with time zone DEFAULT now() NOT NULL
);

CREATE POLICY coach_gere_ses_briques ON public.briques
  USING ((EXISTS ( SELECT 1
   FROM (public.piliers p
     JOIN public.skill_trees st ON ((st.id = p.skill_tree_id)))
  WHERE ((p.id = briques.pilier_id) AND (st.coach_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.piliers p
     JOIN public.skill_trees st ON ((st.id = p.skill_tree_id)))
  WHERE ((p.id = briques.pilier_id) AND (st.coach_id = auth.uid())))));

CREATE POLICY coach_lit_briques_des_modeles ON public.briques
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM (public.piliers p
     JOIN public.skill_trees st ON ((st.id = p.skill_tree_id)))
  WHERE ((p.id = briques.pilier_id) AND (st.coach_id IS NULL)))));

CREATE POLICY coach_gere_ses_piliers ON public.piliers
  USING ((EXISTS ( SELECT 1
   FROM public.skill_trees st
  WHERE ((st.id = piliers.skill_tree_id) AND (st.coach_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.skill_trees st
  WHERE ((st.id = piliers.skill_tree_id) AND (st.coach_id = auth.uid())))));

CREATE POLICY coach_lit_piliers_des_modeles ON public.piliers
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM public.skill_trees st
  WHERE ((st.id = piliers.skill_tree_id) AND (st.coach_id IS NULL)))));

ALTER TABLE public.skill_trees
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.skill_trees
  ADD CONSTRAINT skill_trees_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.coaches(id) ON DELETE CASCADE;

ALTER TABLE public.skill_trees
  ADD CONSTRAINT skill_trees_pkey PRIMARY KEY (id);

ALTER TABLE public.piliers
  ADD CONSTRAINT piliers_skill_tree_id_fkey FOREIGN KEY (skill_tree_id) REFERENCES public.skill_trees(id) ON DELETE CASCADE;

ALTER TABLE public.skill_trees
  ADD CONSTRAINT skill_trees_origine_modele_id_fkey FOREIGN KEY (origine_modele_id) REFERENCES public.skill_trees(id);

GRANT ALL ON public.skill_trees TO anon;

GRANT ALL ON public.skill_trees TO authenticated;

GRANT ALL ON public.skill_trees TO service_role;

CREATE POLICY coach_gere_ses_skill_trees ON public.skill_trees
  USING ((coach_id = auth.uid()))
  WITH CHECK ((coach_id = auth.uid()));

CREATE POLICY coach_lit_les_modeles ON public.skill_trees
  FOR SELECT
  USING ((coach_id IS NULL));

CREATE TABLE public.soumissions (
  id                   uuid                     DEFAULT gen_random_uuid() NOT NULL,
  seance_exercice_id   uuid                     NOT NULL,
  joueur_id            uuid                     NOT NULL,
  video_id             uuid,
  type_validation      text                     NOT NULL,
  validee_par_coach_id uuid,
  statut               text                     DEFAULT 'en_attente'::text NOT NULL,
  date_soumission      timestamp with time zone DEFAULT now() NOT NULL,
  date_validation      timestamp with time zone
);

CREATE POLICY coach_ecrit_feedback_sur_ses_joueurs ON public.feedbacks
  FOR INSERT
  WITH CHECK (((coach_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (public.soumissions sub
     JOIN public.joueurs j ON ((j.id = sub.joueur_id)))
  WHERE ((sub.id = feedbacks.soumission_id) AND (j.coach_id = auth.uid()))))));

CREATE POLICY joueur_lit_feedbacks_recus ON public.feedbacks
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM (public.soumissions sub
     JOIN public.joueurs j ON ((j.id = sub.joueur_id)))
  WHERE ((sub.id = feedbacks.soumission_id) AND (j.auth_user_id = auth.uid())))));

ALTER TABLE public.soumissions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.soumissions
  ADD CONSTRAINT soumission_coherente CHECK (type_validation = 'video'::text AND video_id IS NOT NULL OR type_validation = 'declaratif'::text AND validee_par_coach_id IS
    NOT NULL AND statut = 'validee'::text);

ALTER TABLE public.soumissions
  ADD CONSTRAINT soumissions_joueur_id_fkey FOREIGN KEY (joueur_id) REFERENCES public.joueurs(id);

ALTER TABLE public.soumissions
  ADD CONSTRAINT soumissions_pkey PRIMARY KEY (id);

ALTER TABLE public.feedbacks
  ADD CONSTRAINT feedbacks_soumission_id_fkey FOREIGN KEY (soumission_id) REFERENCES public.soumissions(id) ON DELETE CASCADE;

ALTER TABLE public.soumissions
  ADD CONSTRAINT soumissions_seance_exercice_id_fkey FOREIGN KEY (seance_exercice_id) REFERENCES public.seances_exercices(id) ON DELETE CASCADE;

ALTER TABLE public.soumissions
  ADD CONSTRAINT soumissions_statut_check CHECK (statut = ANY (ARRAY['en_attente'::text, 'validee'::text]));

ALTER TABLE public.soumissions
  ADD CONSTRAINT soumissions_type_validation_check CHECK (type_validation = ANY (ARRAY['video'::text, 'declaratif'::text]));

ALTER TABLE public.soumissions
  ADD CONSTRAINT soumissions_validee_par_coach_id_fkey FOREIGN KEY (validee_par_coach_id) REFERENCES public.coaches(id);

GRANT ALL ON public.soumissions TO anon;

GRANT ALL ON public.soumissions TO authenticated;

GRANT ALL ON public.soumissions TO service_role;

CREATE POLICY coach_lit_soumissions_de_ses_joueurs ON public.soumissions
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM public.joueurs j
  WHERE ((j.id = soumissions.joueur_id) AND (j.coach_id = auth.uid())))));

CREATE POLICY coach_valide_sans_video ON public.soumissions
  FOR INSERT
  WITH CHECK (((type_validation = 'declaratif'::text) AND (validee_par_coach_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.joueurs j
  WHERE ((j.id = soumissions.joueur_id) AND (j.coach_id = auth.uid()))))));

CREATE POLICY coach_valide_une_soumission_video ON public.soumissions
  FOR UPDATE
  USING ((EXISTS ( SELECT 1
   FROM public.joueurs j
  WHERE ((j.id = soumissions.joueur_id) AND (j.coach_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.joueurs j
  WHERE ((j.id = soumissions.joueur_id) AND (j.coach_id = auth.uid())))));

CREATE POLICY joueur_lit_ses_soumissions ON public.soumissions
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM public.joueurs j
  WHERE ((j.id = soumissions.joueur_id) AND (j.auth_user_id = auth.uid())))));

CREATE TABLE public.videos (
  id                    uuid                     DEFAULT gen_random_uuid() NOT NULL,
  url_storage           text,
  type                  text                     NOT NULL,
  uploaded_by_type      text                     NOT NULL,
  uploaded_by_coach_id  uuid,
  uploaded_by_joueur_id uuid,
  statut_upload         text                     DEFAULT 'en_attente'::text NOT NULL,
  cree_le               timestamp with time zone DEFAULT now() NOT NULL
);

CREATE POLICY joueur_soumet_avec_video ON public.soumissions
  FOR INSERT
  WITH CHECK (((type_validation = 'video'::text) AND (EXISTS ( SELECT 1
   FROM public.joueurs j
  WHERE ((j.id = soumissions.joueur_id) AND (j.auth_user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.videos v
  WHERE ((v.id = soumissions.video_id) AND (v.uploaded_by_joueur_id = soumissions.joueur_id))))));

ALTER TABLE public.videos
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.videos
  ADD CONSTRAINT uploader_coherent
    CHECK (uploaded_by_type = 'admin'::text AND uploaded_by_coach_id IS NULL AND uploaded_by_joueur_id IS NULL OR uploaded_by_type = 'coach'::text AND uploaded_by_coach_id IS
    NOT NULL AND uploaded_by_joueur_id IS NULL OR uploaded_by_type = 'joueur'::text AND uploaded_by_joueur_id IS NOT NULL AND uploaded_by_coach_id IS NULL);

ALTER TABLE public.videos
  ADD CONSTRAINT videos_pkey PRIMARY KEY (id);

ALTER TABLE public.briques
  ADD CONSTRAINT briques_video_demo_id_fkey FOREIGN KEY (video_demo_id) REFERENCES public.videos(id);

ALTER TABLE public.exercices
  ADD CONSTRAINT exercices_video_demo_id_fkey FOREIGN KEY (video_demo_id) REFERENCES public.videos(id);

ALTER TABLE public.soumissions
  ADD CONSTRAINT soumissions_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id);

ALTER TABLE public.videos
  ADD CONSTRAINT videos_statut_upload_check CHECK (statut_upload = ANY (ARRAY['en_attente'::text, 'termine'::text, 'echec'::text]));

ALTER TABLE public.videos
  ADD CONSTRAINT videos_type_check CHECK (type = ANY (ARRAY['demo'::text, 'execution'::text, 'feedback'::text]));

ALTER TABLE public.videos
  ADD CONSTRAINT videos_uploaded_by_coach_id_fkey FOREIGN KEY (uploaded_by_coach_id) REFERENCES public.coaches(id) ON DELETE SET NULL;

ALTER TABLE public.videos
  ADD CONSTRAINT videos_uploaded_by_joueur_id_fkey FOREIGN KEY (uploaded_by_joueur_id) REFERENCES public.joueurs(id) ON DELETE SET NULL;

ALTER TABLE public.videos
  ADD CONSTRAINT videos_uploaded_by_type_check CHECK (uploaded_by_type = ANY (ARRAY['admin'::text, 'coach'::text, 'joueur'::text]));

GRANT ALL ON public.videos TO anon;

GRANT ALL ON public.videos TO authenticated;

GRANT ALL ON public.videos TO service_role;

CREATE POLICY coach_lit_ses_propres_videos ON public.videos
  FOR SELECT
  USING ((uploaded_by_coach_id = auth.uid()));

CREATE POLICY coach_lit_videos_de_ses_joueurs ON public.videos
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM public.joueurs j
  WHERE ((j.id = videos.uploaded_by_joueur_id) AND (j.coach_id = auth.uid())))));

CREATE POLICY coach_uploade_ses_videos ON public.videos
  FOR INSERT
  WITH CHECK (((uploaded_by_type = 'coach'::text) AND (uploaded_by_coach_id = auth.uid())));

CREATE POLICY joueur_lit_ses_propres_videos ON public.videos
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM public.joueurs j
  WHERE ((j.id = videos.uploaded_by_joueur_id) AND (j.auth_user_id = auth.uid())))));

CREATE POLICY joueur_uploade_si_consentement_actif ON public.videos
  FOR INSERT
  WITH CHECK (((uploaded_by_type = 'joueur'::text) AND (EXISTS ( SELECT 1
   FROM public.joueurs j
  WHERE ((j.id = videos.uploaded_by_joueur_id) AND (j.auth_user_id = auth.uid()) AND (j.statut_captation_image = 'actif'::text))))));

CREATE POLICY tout_le_monde_lit_les_demos ON public.videos
  FOR SELECT
  USING ((TYPE = 'demo'::text));

CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();
