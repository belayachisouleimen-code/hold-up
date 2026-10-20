-- HOLD UP! — schéma Supabase (salons temps réel, invités, clubs)
-- À coller dans Supabase > SQL Editor > New query > Run. Ré-exécutable sans erreur.
-- Pré-requis : Authentication > Sign In / Providers > « Allow anonymous sign-ins » activé.

-- Profils invités (un pseudo par compte anonyme)
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  pseudo text not null check (char_length(pseudo) between 1 and 24),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profils lisibles" on public.profiles;
create policy "profils lisibles" on public.profiles for select to authenticated using (true);
drop policy if exists "créer son profil" on public.profiles;
create policy "créer son profil" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "modifier son profil" on public.profiles;
create policy "modifier son profil" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Clubs : groupes d'amis avec classement sur plusieurs soirées
create table if not exists public.clubs (
  code text primary key check (code ~ '^[A-Z0-9]{6}$'),
  name text not null check (char_length(name) between 1 and 40),
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.clubs enable row level security;
drop policy if exists "clubs lisibles" on public.clubs;
create policy "clubs lisibles" on public.clubs for select to authenticated using (true);
drop policy if exists "créer un club" on public.clubs;
create policy "créer un club" on public.clubs for insert to authenticated with check (created_by = auth.uid());

create table if not exists public.club_members (
  club_code text not null references public.clubs on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (club_code, user_id)
);
alter table public.club_members enable row level security;
drop policy if exists "membres lisibles" on public.club_members;
create policy "membres lisibles" on public.club_members for select to authenticated using (true);
drop policy if exists "rejoindre un club" on public.club_members;
create policy "rejoindre un club" on public.club_members for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "quitter un club" on public.club_members;
create policy "quitter un club" on public.club_members for delete to authenticated using (user_id = auth.uid());

-- Salons : l'état public de la partie (jamais les réponses avant l'abattage)
create table if not exists public.rooms (
  code text primary key check (code ~ '^[A-Z]{4}$'),
  host_id uuid not null default auth.uid() references auth.users on delete cascade,
  club_code text references public.clubs on delete set null,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rooms enable row level security;
drop policy if exists "salons lisibles" on public.rooms;
create policy "salons lisibles" on public.rooms for select to authenticated using (true);
drop policy if exists "créer un salon" on public.rooms;
create policy "créer un salon" on public.rooms for insert to authenticated with check (host_id = auth.uid());
drop policy if exists "l'hôte met à jour" on public.rooms;
create policy "l'hôte met à jour" on public.rooms for update to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());
drop policy if exists "l'hôte supprime" on public.rooms;
create policy "l'hôte supprime" on public.rooms for delete to authenticated using (host_id = auth.uid());

-- État privé de l'hôte (partie complète avec réponses), pour reprendre après un rechargement
create table if not exists public.room_private (
  code text primary key references public.rooms on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.room_private enable row level security;
drop policy if exists "hôte seulement" on public.room_private;
create policy "hôte seulement" on public.room_private for all to authenticated
  using (exists (select 1 from public.rooms r where r.code = room_private.code and r.host_id = auth.uid()))
  with check (exists (select 1 from public.rooms r where r.code = room_private.code and r.host_id = auth.uid()));

-- Actions des joueurs (rejoindre, miser, répondre). Seul l'hôte peut les lire : les réponses restent secrètes.
create table if not exists public.actions (
  id bigint generated always as identity primary key,
  room_code text not null references public.rooms on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  payload jsonb not null check (pg_column_size(payload) < 2000),
  created_at timestamptz not null default now()
);
create index if not exists actions_room_id on public.actions (room_code, id);
alter table public.actions enable row level security;
drop policy if exists "envoyer une action" on public.actions;
create policy "envoyer une action" on public.actions for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.rooms r where r.code = room_code));
drop policy if exists "l'hôte lit les actions" on public.actions;
create policy "l'hôte lit les actions" on public.actions for select to authenticated
  using (exists (select 1 from public.rooms r where r.code = actions.room_code and r.host_id = auth.uid()));
drop policy if exists "l'hôte nettoie" on public.actions;
create policy "l'hôte nettoie" on public.actions for delete to authenticated
  using (exists (select 1 from public.rooms r where r.code = actions.room_code and r.host_id = auth.uid()));

-- Résultats des soirées jouées dans un club
create table if not exists public.club_results (
  id bigint generated always as identity primary key,
  club_code text not null references public.clubs on delete cascade,
  room_code text not null,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  ranking jsonb not null,
  played_at timestamptz not null default now(),
  unique (club_code, room_code, played_at)
);
alter table public.club_results enable row level security;
drop policy if exists "résultats lisibles" on public.club_results;
create policy "résultats lisibles" on public.club_results for select to authenticated using (true);
drop policy if exists "un membre enregistre" on public.club_results;
create policy "un membre enregistre" on public.club_results for insert to authenticated
  with check (created_by = auth.uid() and exists (select 1 from public.club_members m where m.club_code = club_results.club_code and m.user_id = auth.uid()));

-- Temps réel : les téléphones écoutent leur salon, l'hôte écoute les actions
do $$ begin
  begin alter publication supabase_realtime add table public.rooms; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.actions; exception when duplicate_object then null; end;
end $$;

-- Ménage optionnel : supprimer les salons de plus de 2 jours
-- delete from public.rooms where updated_at < now() - interval '2 days';
