-- Spary : chats de séance (canal « #id » de Sheets = id de la séance).
-- À coller dans SQL Editor → Run, après 001_schema.sql. Réexécutable.

alter table messages add column if not exists seance_id text references seances(id) on delete cascade;
alter table messages drop constraint if exists messages_check;
alter table messages drop constraint if exists messages_one_target;
alter table messages add constraint messages_one_target
  check (num_nonnulls(recipient, group_id, seance_id) = 1);
create index if not exists messages_seance_idx on messages (seance_id, created_at desc) where seance_id is not null;

-- Organisateur ou inscrit.
create or replace function app.in_seance(s text, m uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from seances where id = s and organizer = m)
      or exists (select 1 from seance_members where seance_id = s and member_id = m)
$$;

create or replace function app.can_see_message(m messages) returns boolean
language sql stable security definer set search_path = public, app as $$
  select m.sender = app.me() or m.recipient = app.me()
      or (m.group_id  is not null and app.in_group(m.group_id, app.me()))
      or (m.seance_id is not null and app.in_seance(m.seance_id, app.me()))
$$;

drop policy if exists messages_send on messages;
create policy messages_send on messages for insert to authenticated with check (
  sender = app.me() and not app.is_banned(app.me()) and (
    (recipient is not null and not app.is_blocked(app.me(), recipient))
    or (group_id  is not null and app.in_group(group_id, app.me()))
    or (seance_id is not null and app.in_seance(seance_id, app.me()))
  )
);
