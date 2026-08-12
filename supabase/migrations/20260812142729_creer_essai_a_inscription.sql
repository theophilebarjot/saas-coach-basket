-- Étend handle_new_coach pour créer automatiquement une période d'essai de
-- 14 jours à l'inscription d'un coach, en plus du clonage du skill tree déjà
-- en place. Le joueur continue d'être exclu via le même garde-fou existant.
CREATE OR REPLACE FUNCTION public.handle_new_coach()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Si l'inscription porte le marqueur "role: joueur", on ne fait rien ici :
  -- ce n'est pas un coach, pas de ligne coaches, pas de skill tree cloné.
  if new.raw_user_meta_data->>'role' = 'joueur' then
    return new;
  end if;

  insert into public.coaches (id, email)
  values (new.id, new.email);

  perform public.cloner_modele_skill_tree(
    new.id, '00000000-0000-0000-0000-000000000001'
  );

  -- Crée automatiquement une période d'essai de 14 jours, sans carte
  -- bancaire ni objet Stripe à ce stade : le coach reste en statut 'essai'
  -- (valeur par défaut de la colonne) jusqu'à ce qu'il choisisse de
  -- s'abonner via Stripe Checkout, moment où le webhook viendra remplacer
  -- ces valeurs par un vrai abonnement actif.
  insert into public.abonnements (coach_id, date_debut, date_fin)
  values (new.id, now(), now() + interval '14 days');

  return new;
end;
$function$