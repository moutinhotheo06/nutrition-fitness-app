-- Spary : tables du serveur « api » (remplaçant d'Apps Script). Après 001 et 002. Réexécutable.
create extension if not exists pgcrypto;

-- Mot de passe : bcrypt (pgcrypto). Vide tant que le membre ne s'est pas reconnecté
-- (vérification par l'ancien Apps Script à la 1re connexion, puis enregistrement ici).
alter table member_private add column if not exists pw_hash text;

create table if not exists sessions (
  token_hash text primary key,
  member_id  uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_member_idx on sessions (member_id);

-- Jetons e-mail (confirmation, mot de passe oublié…)
create table if not exists tokens (
  token_hash text primary key,
  member_id  uuid not null references members(id) on delete cascade,
  type       text not null,
  expires_at timestamptz not null
);

create table if not exists rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  hits         int not null default 0
);

alter table sessions    enable row level security;
alter table tokens      enable row level security;
alter table rate_limits enable row level security;
-- Aucune règle : réservées au serveur.
