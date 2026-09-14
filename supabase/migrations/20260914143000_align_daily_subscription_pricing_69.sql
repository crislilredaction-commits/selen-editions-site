-- Aligne les valeurs par défaut Selen Daily avec l'offre de production vérifiée le 14/09/2026.
-- Les lignes historiques ne sont pas réécrites : seuls les futurs abonnements sans métadonnées explicites héritent de ces valeurs.

alter table public.daily_subscriptions
  alter column base_monthly_amount_cents set default 6900,
  alter column pricing_rule_accepted_version set default 'daily_150_2026_08_69';
