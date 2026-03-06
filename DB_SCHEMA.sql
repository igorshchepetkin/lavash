-- Lavash Tournament App — DB schema (executable order + documentation)
-- Source: Supabase-exported schema, reorganized into a runnable order.
--
-- Notes:
-- - This file is intended to be runnable in a clean database (with pgcrypto).
-- - If you already have tables, use as reference, not for re-creation.
-- - Comments explain the purpose and app-level usage.

-- =====================================================================
-- Extensions
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- Table: tournaments
-- Purpose:
--   Master entity for a tournament. Stores mode (TEAM/SOLO), lifecycle status
--   (draft/live/finished/canceled), base points per court, and metadata.
--
-- Usage:
--   - Public: list/show tournaments; allow apply only when status=draft.
--   - Admin: judge operations are guarded by status.
--   - Points: points_c1..c4 may be overridden per match via tournament_points_overrides.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.tournaments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  date date NOT NULL,
  registration_mode text NOT NULL CHECK (registration_mode = ANY (ARRAY['TEAM'::text, 'SOLO'::text])),
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'live'::text, 'finished'::text, 'canceled'::text])),
  points_c1 integer NOT NULL DEFAULT 5,
  points_c2 integer NOT NULL DEFAULT 4,
  points_c3 integer NOT NULL DEFAULT 3,
  points_c4 integer NOT NULL DEFAULT 2,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  start_time text,
  CONSTRAINT tournaments_pkey PRIMARY KEY (id)
);

-- =====================================================================
-- Table: registrations
-- Purpose:
--   Applications submitted before the tournament starts.
--   TEAM: 3 player names; SOLO: 1 player (first/last/full), phone, etc.
--   Stores confirmation_code for withdraw flows and reserve-confirm flows.
--
-- Usage:
--   - Admin: accept/reject/unaccept while tournament is draft.
--   - Accepted registrations lead to creating players (+ team in TEAM mode).
--   - Reserve model:
--       * accepted        = in the main roster
--       * reserve         = accepted by judge but outside roster capacity
--       * reserve_pending = invited from reserve to main roster, waiting confirmation
--   - strength is used:
--       * TEAM: team-level strength (single value).
--       * SOLO: player-level strength stored on registration (then synced to players depending on flow).
--
-- Important:
--   - Main roster capacity is app-level, not DB-level:
--       * SOLO: 24 accepted registrations
--       * TEAM: 8 accepted registrations
--   - Reserve/reserve_pending registrations do NOT create players/teams until promoted.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.registrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode = ANY (ARRAY['TEAM'::text, 'SOLO'::text])),
  team_player1 text,
  team_player2 text,
  team_player3 text,
  solo_player text,
  strength integer CHECK (strength >= 1 AND strength <= 5),
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY[
    'pending'::text,
    'accepted'::text,
    'reserve'::text,
    'reserve_pending'::text,
    'rejected'::text,
    'withdrawn'::text,
    'canceled'::text
  ])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  confirmation_code text,
  solo_first_name text,
  solo_last_name text,
  phone text,
  CONSTRAINT registrations_pkey PRIMARY KEY (id),
  CONSTRAINT registrations_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id)
);

-- =====================================================================
-- Table: players
-- Purpose:
--   Canonical participant entity used by tournament mechanics and SOLO team building.
--
-- Usage:
--   - SOLO: accepted registration -> one player row. strength per player (1..5).
--           optional seeding: seed_team_index (1..8), seed_slot (1..3).
--   - TEAM: accepted TEAM registration -> three player rows; linked to team via team_members.
--   - Reserve registrations do not generate players until actually promoted to accepted.
--
-- Bucket logic (SOLO, implementation detail):
--   Players are ranked deterministically by:
--     strength DESC, hash(id + tournamentId) ASC, id ASC
--   Then bucketed into A/B/C by rank slices (8/8/8).
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.players (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL,
  full_name text NOT NULL,
  strength integer NOT NULL DEFAULT 3 CHECK (strength >= 1 AND strength <= 5),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  registration_id uuid,
  seed_team_index integer CHECK (seed_team_index IS NULL OR (seed_team_index >= 1 AND seed_team_index <= 8)),
  seed_slot integer CHECK (seed_slot IS NULL OR (seed_slot >= 1 AND seed_slot <= 3)),
  CONSTRAINT players_pkey PRIMARY KEY (id),
  CONSTRAINT players_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id),
  CONSTRAINT players_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES public.registrations(id)
);

-- =====================================================================
-- Table: teams
-- Purpose:
--   Team entity participating in games and scoring. Holds accumulated points.
--
-- Usage:
--   - SOLO: build-teams creates 8 teams.
--           IMPORTANT: in DB team.name contains ONLY "ФИО1 / ФИО2 / ФИО3" (no A/B/C prefix).
--           UI derives team_index 1..8 by ordering teams.created_at ASC.
--           reset-teams deletes teams + team_members to allow rebuild.
--   - TEAM: accepting TEAM registration creates team linked to registration_id.
--   - Reserve registrations do not generate teams until promotion to accepted.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL,
  name text NOT NULL,
  points integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  registration_id uuid,
  CONSTRAINT teams_pkey PRIMARY KEY (id),
  CONSTRAINT teams_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id),
  CONSTRAINT teams_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES public.registrations(id)
);

-- =====================================================================
-- Table: team_members
-- Purpose:
--   Roster: assigns players into teams with slots 1..3.
--
-- Usage:
--   - SOLO build-teams: fills 8 teams * 3 slots = 24 rows.
--   - TEAM accept: fills one team with 3 players.
--   - Reserve registrations do not create team_members.
--
-- Constraints:
--   - PRIMARY KEY (team_id, slot): one player per slot.
--   - player_id UNIQUE: player belongs to only one team.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.team_members (
  team_id uuid NOT NULL,
  player_id uuid NOT NULL UNIQUE,
  slot integer NOT NULL CHECK (slot >= 1 AND slot <= 3),
  CONSTRAINT team_members_pkey PRIMARY KEY (team_id, slot),
  CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT team_members_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id)
);

-- =====================================================================
-- Table: team_state
-- Purpose:
--   Stores ladder position per team during tournament progression (current_court 1..4).
--
-- Usage:
--   - game/result updates current_court for winner/loser.
--   - start creates stages #2+ pairing by current_court (2 teams per court).
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.team_state (
  tournament_id uuid NOT NULL,
  team_id uuid NOT NULL,
  current_court integer NOT NULL CHECK (current_court >= 1 AND current_court <= 4),
  CONSTRAINT team_state_pkey PRIMARY KEY (tournament_id, team_id),
  CONSTRAINT team_state_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id),
  CONSTRAINT team_state_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
);

-- =====================================================================
-- Table: stages
-- Purpose:
--   Tournament rounds (“Матч №N”). Each stage has 4 games (courts 1..4).
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.stages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL,
  number integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT stages_pkey PRIMARY KEY (id),
  CONSTRAINT stages_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id)
);

-- =====================================================================
-- Table: games
-- Purpose:
--   A single court game within a stage: two teams, optional winner, optional score.
--
-- Usage:
--   - start creates 4 games per stage (courts 1..4).
--   - game/result sets winner_team_id, score_text, points_awarded.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.games (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL,
  stage_id uuid NOT NULL,
  court integer NOT NULL CHECK (court >= 1 AND court <= 4),
  team_a_id uuid NOT NULL,
  team_b_id uuid NOT NULL,
  winner_team_id uuid,
  score_text text,
  points_awarded integer,
  is_final boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT games_pkey PRIMARY KEY (id),
  CONSTRAINT games_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id),
  CONSTRAINT games_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.stages(id),
  CONSTRAINT games_team_a_id_fkey FOREIGN KEY (team_a_id) REFERENCES public.teams(id),
  CONSTRAINT games_team_b_id_fkey FOREIGN KEY (team_b_id) REFERENCES public.teams(id),
  CONSTRAINT games_winner_team_id_fkey FOREIGN KEY (winner_team_id) REFERENCES public.teams(id)
);

-- =====================================================================
-- Table: tournament_points_overrides
-- Purpose:
--   Optional per-stage overrides for points per court.
--
-- Usage:
--   - Editable only before match 1 starts.
--   - If override exists for stage_number, it replaces tournaments.points_c1..c4.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.tournament_points_overrides (
  tournament_id uuid NOT NULL,
  stage_number integer NOT NULL CHECK (stage_number >= 1),
  points_c1 integer NOT NULL,
  points_c2 integer NOT NULL,
  points_c3 integer NOT NULL,
  points_c4 integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tournament_points_overrides_pkey PRIMARY KEY (tournament_id, stage_number),
  CONSTRAINT tournament_points_overrides_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id)
);

-- =====================================================================
-- Table: registration_payments
-- Purpose:
--   Payment confirmations per registration per slot (1..3).
--   SOLO typically uses slot=1 only; TEAM uses 1..3.
--
-- Guards:
--   assertAllAcceptedPaid(tournamentId) blocks build-teams and start if any accepted
--   registration has unpaid required slots.
--
-- Notes:
--   - Reserve/reserve_pending registrations may still keep payment rows if judge used payment UI
--     before or after moving statuses, but only accepted registrations are relevant for build/start guards.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.registration_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  slot integer NOT NULL CHECK (slot >= 1 AND slot <= 3),
  paid boolean NOT NULL DEFAULT false,
  paid_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT registration_payments_pkey PRIMARY KEY (id),
  CONSTRAINT registration_payments_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id),
  CONSTRAINT registration_payments_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES public.registrations(id)
);

-- =====================================================================
-- Expected indices / constraints (recommended)
-- These are not strictly required to run the schema, but strongly recommended
-- for correctness/performance and to match app assumptions.
--
-- If some of these already exist in Supabase, keep the existing names/definitions.
-- =====================================================================

-- 1) Stages: one stage number per tournament
CREATE UNIQUE INDEX IF NOT EXISTS ux_stages_tournament_number
  ON public.stages (tournament_id, number);

-- 2) Games: one game per court per stage
CREATE UNIQUE INDEX IF NOT EXISTS ux_games_stage_court
  ON public.games (stage_id, court);

-- 3) Players seeding: only one seeded player per team_index within a tournament (partial unique)
-- App assumes this to prevent two players seeded into same team.
CREATE UNIQUE INDEX IF NOT EXISTS ux_players_seed_team_index_per_tournament
  ON public.players (tournament_id, seed_team_index)
  WHERE seed_team_index IS NOT NULL;

-- Optional: if you ever use seed_slot for something stricter, keep it app-level, not DB-level for now.

-- 4) Registration payments: one row per (registration_id, slot) (partial correctness)
-- This prevents duplicates like two rows for same registration slot.
CREATE UNIQUE INDEX IF NOT EXISTS ux_registration_payments_registration_slot
  ON public.registration_payments (registration_id, slot);

-- 5) Performance indexes for common filters
CREATE INDEX IF NOT EXISTS ix_registrations_tournament_id
  ON public.registrations (tournament_id);

CREATE INDEX IF NOT EXISTS ix_registrations_tournament_status_created_at
  ON public.registrations (tournament_id, status, created_at);

CREATE INDEX IF NOT EXISTS ix_registrations_tournament_confirmation_code
  ON public.registrations (tournament_id, confirmation_code);

CREATE INDEX IF NOT EXISTS ix_players_tournament_id
  ON public.players (tournament_id);

CREATE INDEX IF NOT EXISTS ix_teams_tournament_id
  ON public.teams (tournament_id);

CREATE INDEX IF NOT EXISTS ix_stages_tournament_id
  ON public.stages (tournament_id);

CREATE INDEX IF NOT EXISTS ix_games_tournament_id
  ON public.games (tournament_id);

CREATE INDEX IF NOT EXISTS ix_games_stage_id
  ON public.games (stage_id);

CREATE INDEX IF NOT EXISTS ix_team_members_team_id
  ON public.team_members (team_id);

-- (player_id has UNIQUE, so index already exists implicitly in most Postgres setups,
-- but keeping this here as an explicit expectation is fine.)
-- CREATE INDEX IF NOT EXISTS ix_team_members_player_id ON public.team_members (player_id);

CREATE INDEX IF NOT EXISTS ix_team_state_tournament_id
  ON public.team_state (tournament_id);

CREATE INDEX IF NOT EXISTS ix_registration_payments_tournament_id
  ON public.registration_payments (tournament_id);

CREATE INDEX IF NOT EXISTS ix_registration_payments_registration_id
  ON public.registration_payments (registration_id);