-- Spary : tâches planifiées (remplacent les déclencheurs Apps Script). Réexécutable.
-- À lancer UNE fois dans Supabase → SQL Editor, APRÈS le déploiement de la fonction « api ».
-- Aucune clé à recopier : la clé des tâches est créée ici, rangée dans le coffre (Vault),
-- et la fonction « api » la relit elle-même.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1. Clé des tâches (créée une seule fois).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'spary_cron') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'spary_cron', 'Clé des tâches planifiées Spary');
  end if;
end $$;

-- 2. Toutes les 15 minutes : la fonction décide elle-même quoi lancer selon l'heure de Paris
--    (rappels toutes les 15 min ; 4 h : nettoyage, RGPD, stats ; 7 h : contrôle ; dimanche 3 h : sauvegarde).
select cron.unschedule(jobid) from cron.job where jobname in ('spary-quart', 'spary-purge');
select cron.schedule('spary-quart', '*/15 * * * *', $job$
  select net.http_post(
    url := 'https://chaqyhfkccjpzqcmxpfg.supabase.co/functions/v1/api?cron=quart',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'spary_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
$job$);

-- 3. Chaque nuit (3 h 30 UTC) : purge du cache expiré, de l'historique de plus de 14 jours
--    et des réponses pg_net de plus de 2 jours.
select cron.schedule('spary-purge', '30 3 * * *', $job$
  delete from public.gas_cache where expires_at < now();
  delete from public.gas_history where saved_at < now() - interval '14 days';
  delete from net._http_response where created < now() - interval '2 days';
$job$);

-- Vérification : les deux tâches doivent apparaître.
select jobname, schedule, active from cron.job where jobname like 'spary-%';
