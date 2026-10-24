-- Spary : stockage du moteur « Apps Script sur Supabase ».
-- Chaque onglet de BDD Spary = une ligne (cellules en JSON). Grosses cellules (photos) à part.
-- Réservé au serveur (RLS sans règle). Réexécutable.

create table if not exists gas_sheets (
  name       text primary key,
  pos        int  not null default 0,
  data       jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists gas_blobs (
  id    text primary key,          -- empreinte SHA-1 du contenu
  value text not null
);
create table if not exists gas_props (
  key   text primary key,
  value text not null
);
create table if not exists gas_cache (
  key        text primary key,
  value      text not null,
  expires_at timestamptz not null
);
create index if not exists gas_cache_exp_idx on gas_cache (expires_at);
create table if not exists gas_files (
  id         text primary key,
  name       text not null default '',
  mime       text not null default 'application/octet-stream',
  b64        text not null default '',
  trashed    boolean not null default false,
  folder     text not null default '',
  created_at timestamptz not null default now()
);

-- Historique (filet de sécurité) : au plus une copie de chaque onglet par heure, gardée 14 jours (purge : 005_cron.sql).
create table if not exists gas_history (
  id         bigint generated always as identity primary key,
  name       text not null,
  data       jsonb not null,
  saved_at   timestamptz not null default now()
);
create index if not exists gas_history_name_idx on gas_history (name, saved_at desc);
create or replace function gas_keep_history() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.data is distinct from new.data
     and not exists (select 1 from gas_history h where h.name = old.name and h.saved_at > now() - interval '1 hour') then
    insert into gas_history (name, data) values (old.name, old.data);
  end if;
  return new;
end $$;
drop trigger if exists gas_sheets_history on gas_sheets;
create trigger gas_sheets_history before update on gas_sheets for each row execute function gas_keep_history();

alter table gas_sheets  enable row level security;
alter table gas_blobs   enable row level security;
alter table gas_props   enable row level security;
alter table gas_cache   enable row level security;
alter table gas_files   enable row level security;
alter table gas_history enable row level security;
