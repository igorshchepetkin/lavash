-- Lavash Tournament App — DB schema (executable order + documentation)
-- Source:
--   - Previous documented DB schema
--   - Current Supabase-exported schema after admin/auth/tournament-role changes
--
-- Notes:
-- - This file is intended to be runnable in a clean database (with pgcrypto).
-- - If you already have tables, use as reference, not for re-creation.
-- - Comments explain the purpose and app-level usage.
-- - Table order is reorganized into a runnable dependency-safe sequence.
-- - Some recommended indices/constraints are included at the end.
-- - Defaults in DB may differ from current UI defaults in some places
--   (for example tournament points); the UI/API may explicitly pass values.

-- =====================================================================
-- Extensions
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- Table: admin_users
-- Purpose:
--   Master directory of admin-panel users.
--
-- Stores:
--   - name
--   - login
--   - password hash
--   - role set
--   - active flag
--   - password rotation flags/dates
--   - audit fields (created_by / updated_by)
--
-- Roles:
--   - ADMIN
--   - CHIEF_JUDGE
--   - JUDGE
--
-- Usage:
--   - Authentication and session creation
--   - Authorization in admin UI and API routes
--   - Assigning chief judge to a tournament
--   - Assigning judges to tournaments
--
-- Lifecycle:
--   - users are not physically deleted
--   - users may be disabled via is_active=false
--   - password resets set must_change_password=true
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  login text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  roles text[] NOT NULL DEFAULT ARRAY[]::text[]
    CHECK (roles <@ ARRAY['ADMIN'::text, 'CHIEF_JUDGE'::text, 'JUDGE'::text]),
  is_active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT true,
  password_changed_at timestamp with time zone,
  password_expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT admin_users_pkey PRIMARY KEY (id),
  CONSTRAINT admin_users_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.admin_users(id),
  CONSTRAINT admin_users_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.admin_users(id)
);

-- =====================================================================
-- Table: admin_auth_settings
-- Purpose:
--   Singleton table with configurable admin authentication parameters.
--
-- Stores:
--   - minimum password length
--   - password complexity requirement
--   - password lifetime (days)
--   - admin session idle timeout (minutes)
--   - auth log retention (days)
--   - automatic tournament archive threshold (days)
--
-- Usage:
--   - login/password-change validation
--   - session expiration handling
--   - log cleanup jobs
--   - tournament archive logic
--
-- Notes:
--   - Intended to contain exactly one row (id = 1 in practice).
--   - updated_by points to the admin user who last changed settings.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.admin_auth_settings (
  id integer NOT NULL,
  min_password_length integer NOT NULL DEFAULT 8
    CHECK (min_password_length >= 6),
  require_complexity boolean NOT NULL DEFAULT true,
  password_max_age_days integer
    CHECK (password_max_age_days IS NULL OR password_max_age_days >= 1),
  session_idle_timeout_minutes integer NOT NULL DEFAULT 60
    CHECK (session_idle_timeout_minutes >= 5),
  auth_log_retention_days integer NOT NULL DEFAULT 180
    CHECK (auth_log_retention_days >= 1),
  tournament_archive_days integer NOT NULL DEFAULT 30
    CHECK (tournament_archive_days >= 1),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT admin_auth_settings_pkey PRIMARY KEY (id),
  CONSTRAINT admin_auth_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.admin_users(id)
);

-- =====================================================================
-- Table: admin_sessions
-- Purpose:
--   Persistent admin login sessions.
--
-- Stores:
--   - session token
--   - creation time
--   - last activity time
--   - expiry time
--   - closed_at marker for logout/forced close
--   - IP / User-Agent audit data
--
-- Usage:
--   - cookie-based admin authentication
--   - idle timeout enforcement
--   - session invalidation on logout
--
-- Notes:
--   - session_token is unique and should never be exposed in UI.
--   - closed_at != null means the session should be treated as inactive.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_token text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_activity_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  closed_at timestamp with time zone,
  ip text,
  user_agent text,
  CONSTRAINT admin_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT admin_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.admin_users(id)
);

-- =====================================================================
-- Table: admin_auth_log
-- Purpose:
--   Immutable authentication / authorization audit trail for admin users.
--
-- Stores:
--   - successful and failed login attempts
--   - logout events
--   - password changes
--   - admin password reset events
--   - optional user_id if resolved
--   - login, message, IP, User-Agent
--
-- Usage:
--   - audit and troubleshooting
--   - security review
--   - admin "Auth log" page
--
-- Notes:
--   - log rows are not edited or deleted manually
--   - cleanup may remove old rows according to admin_auth_settings.auth_log_retention_days
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.admin_auth_log (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid,
  login text,
  event_type text NOT NULL,
  success boolean NOT NULL,
  message text,
  ip text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT admin_auth_log_pkey PRIMARY KEY (id),
  CONSTRAINT admin_auth_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.admin_users(id)
);

-- =====================================================================
-- Table: tournaments
-- Purpose:
--   Master entity for a tournament.
--
-- Stores:
--   - name
--   - date
--   - mode (TEAM / SOLO)
--   - lifecycle status (draft / live / finished / canceled)
--   - base points per court
--   - optional start time
--   - assigned chief judge
--   - archive metadata
--
-- Usage:
--   - Public: list/show tournaments; allow apply only when status=draft.
--   - Admin: judge operations are guarded by status.
--   - Settings: chief judge and judges assignment.
--   - Archive: hidden from active lists when archived_at is filled.
--
-- Archive model:
--   - archived_at marks when tournament moved to archive
--   - archived_by_user_id may store who archived it manually
--   - auto-archive may set archived_at without an explicit user
--
-- Notes:
--   - points_c1..c4 may be overridden per match via tournament_points_overrides
--   - current UI may create tournaments with different defaults than DB defaults
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.tournaments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  date date NOT NULL,
  registration_mode text NOT NULL
    CHECK (registration_mode = ANY (ARRAY['TEAM'::text, 'SOLO'::text])),
  status text NOT NULL DEFAULT 'draft'::text
    CHECK (status = ANY (ARRAY['draft'::text, 'live'::text, 'finished'::text, 'canceled'::text])),
  points_c1 integer NOT NULL DEFAULT 5,
  points_c2 integer NOT NULL DEFAULT 4,
  points_c3 integer NOT NULL DEFAULT 3,
  points_c4 integer NOT NULL DEFAULT 2,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  start_time text,
  chief_judge_user_id uuid,
  archived_at timestamp with time zone,
  archived_by_user_id uuid,
  CONSTRAINT tournaments_pkey PRIMARY KEY (id),
  CONSTRAINT tournaments_chief_judge_user_id_fkey FOREIGN KEY (chief_judge_user_id) REFERENCES public.admin_users(id),
  CONSTRAINT tournaments_archived_by_user_id_fkey FOREIGN KEY (archived_by_user_id) REFERENCES public.admin_users(id)
);

-- =====================================================================
-- Table: tournament_judges
-- Purpose:
--   Many-to-many assignment of judge users to a tournament.
--
-- Stores:
--   - which admin user with role JUDGE is assigned to which tournament
--   - who assigned them
--
-- Usage:
--   - Used by permissions in match entry UI/API
--   - Chief judge or admin can maintain this list
--
-- Notes:
--   - chief_judge_user_id is stored directly on tournaments
--   - additional operational judges are stored here
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.tournament_judges (
  tournament_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT tournament_judges_pkey PRIMARY KEY (tournament_id, user_id),
  CONSTRAINT tournament_judges_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id),
  CONSTRAINT tournament_judges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.admin_users(id),
  CONSTRAINT tournament_judges_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.admin_users(id)
);

-- =====================================================================
-- Table: registrations
-- Purpose:
--   Applications submitted before the tournament starts.
--
-- TEAM:
--   stores 3 player names and one applicant phone.
--
-- SOLO:
--   stores first name, last name, derived full name / solo_player, phone, etc.
--
-- Shared:
--   stores confirmation_code used in public withdraw / reserve-confirm flows.
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
--       * SOLO: player-level strength stored on registration (then copied/synced to players).
--
-- Important:
--   - Main roster capacity is app-level, not DB-level:
--       * SOLO: 24 accepted registrations
--       * TEAM: 8 accepted registrations
--   - Reserve / reserve_pending registrations do NOT create players/teams until promoted.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.registrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL,
  mode text NOT NULL
    CHECK (mode = ANY (ARRAY['TEAM'::text, 'SOLO'::text])),
  team_player1 text,
  team_player2 text,
  team_player3 text,
  solo_player text,
  strength integer CHECK (strength >= 1 AND strength <= 5),
  status text NOT NULL DEFAULT 'pending'::text
    CHECK (status = ANY (ARRAY[
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
--   - SOLO: accepted registration -> one player row.
--           strength per player (1..5).
--           optional seeding: seed_team_index (1..8), seed_slot (1..3).
--   - TEAM: accepted TEAM registration -> three player rows; linked to team via team_members.
--   - Reserve registrations do not generate players until promoted to accepted.
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
  seed_team_index integer
    CHECK (seed_team_index IS NULL OR seed_team_index >= 1 AND seed_team_index <= 8),
  seed_slot integer
    CHECK (seed_slot IS NULL OR seed_slot >= 1 AND seed_slot <= 3),
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
--           IMPORTANT: in DB team.name contains ONLY "ФИО1 / ФИО2 / ФИО3" (no numeric prefix).
--           UI derives team_index 1..8 by ordering teams.created_at ASC.
--           reset-teams deletes teams + team_members to allow rebuild.
--   - TEAM: accepting TEAM registration creates one team linked to registration_id.
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
--   Roster table: assigns players into teams with slots 1..3.
--
-- Usage:
--   - SOLO build-teams: fills 8 teams * 3 slots = 24 rows.
--   - TEAM accept: fills one team with 3 players.
--   - Reserve registrations do not create team_members.
--
-- Constraints:
--   - PRIMARY KEY (team_id, slot): one player per slot in a team.
--   - player_id UNIQUE: one player belongs to only one team.
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
--   - game/result updates current_court for winner/loser
--   - start creates stages #2+ pairing by current_court (2 teams per court)
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
--
-- Usage:
--   - start creates a new stage before creating its games
--   - finish uses the latest stage to validate completion
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
--   - start creates 4 games per stage (courts 1..4)
--   - game/result sets winner_team_id, score_text, points_awarded
--   - finish may mark the last-stage games as is_final=true
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
--
-- SOLO:
--   usually uses slot=1 only.
--
-- TEAM:
--   uses 1..3 (one confirmation per player slot).
--
-- Guards:
--   assertAllAcceptedPaid(tournamentId) blocks build-teams and start if any accepted
--   registration has unpaid required slots.
--
-- Notes:
--   - Reserve / reserve_pending registrations may still keep payment rows if payment UI
--     was touched, but only accepted registrations matter for build/start guards.
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

-- ---------------------------------------------------------------------
-- Admin/auth constraints & performance
-- ---------------------------------------------------------------------

-- Exactly one settings row is intended in practice (commonly id = 1).
-- The PK already guarantees uniqueness per id, so this remains an app convention.

CREATE INDEX IF NOT EXISTS ix_admin_users_is_active
  ON public.admin_users (is_active);

CREATE INDEX IF NOT EXISTS ix_admin_users_last_name_first_name
  ON public.admin_users (last_name, first_name);

CREATE INDEX IF NOT EXISTS ix_admin_users_roles_gin
  ON public.admin_users USING gin (roles);

CREATE INDEX IF NOT EXISTS ix_admin_sessions_user_id
  ON public.admin_sessions (user_id);

CREATE INDEX IF NOT EXISTS ix_admin_sessions_session_token
  ON public.admin_sessions (session_token);

CREATE INDEX IF NOT EXISTS ix_admin_sessions_expires_at
  ON public.admin_sessions (expires_at);

CREATE INDEX IF NOT EXISTS ix_admin_sessions_last_activity_at
  ON public.admin_sessions (last_activity_at);

CREATE INDEX IF NOT EXISTS ix_admin_auth_log_created_at
  ON public.admin_auth_log (created_at);

CREATE INDEX IF NOT EXISTS ix_admin_auth_log_user_id_created_at
  ON public.admin_auth_log (user_id, created_at);

CREATE INDEX IF NOT EXISTS ix_admin_auth_log_login_created_at
  ON public.admin_auth_log (login, created_at);

-- ---------------------------------------------------------------------
-- Tournament metadata / permissions
-- ---------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS ix_tournaments_status_date
  ON public.tournaments (status, date);

CREATE INDEX IF NOT EXISTS ix_tournaments_archived_at
  ON public.tournaments (archived_at);

CREATE INDEX IF NOT EXISTS ix_tournaments_chief_judge_user_id
  ON public.tournaments (chief_judge_user_id);

CREATE INDEX IF NOT EXISTS ix_tournament_judges_user_id
  ON public.tournament_judges (user_id);

-- ---------------------------------------------------------------------
-- Tournament mechanics constraints
-- ---------------------------------------------------------------------

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

-- 4) Registration payments: one row per (registration_id, slot)
CREATE UNIQUE INDEX IF NOT EXISTS ux_registration_payments_registration_slot
  ON public.registration_payments (registration_id, slot);

-- ---------------------------------------------------------------------
-- Performance indexes for common filters
-- ---------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS ix_registrations_tournament_id
  ON public.registrations (tournament_id);

CREATE INDEX IF NOT EXISTS ix_registrations_tournament_status_created_at
  ON public.registrations (tournament_id, status, created_at);

CREATE INDEX IF NOT EXISTS ix_registrations_tournament_confirmation_code
  ON public.registrations (tournament_id, confirmation_code);

CREATE INDEX IF NOT EXISTS ix_players_tournament_id
  ON public.players (tournament_id);

CREATE INDEX IF NOT EXISTS ix_players_registration_id
  ON public.players (registration_id);

CREATE INDEX IF NOT EXISTS ix_teams_tournament_id
  ON public.teams (tournament_id);

CREATE INDEX IF NOT EXISTS ix_teams_registration_id
  ON public.teams (registration_id);

CREATE INDEX IF NOT EXISTS ix_stages_tournament_id
  ON public.stages (tournament_id);

CREATE INDEX IF NOT EXISTS ix_games_tournament_id
  ON public.games (tournament_id);

CREATE INDEX IF NOT EXISTS ix_games_stage_id
  ON public.games (stage_id);

CREATE INDEX IF NOT EXISTS ix_team_members_team_id
  ON public.team_members (team_id);

-- player_id already has UNIQUE, so an index normally exists implicitly.

CREATE INDEX IF NOT EXISTS ix_team_state_tournament_id
  ON public.team_state (tournament_id);

CREATE INDEX IF NOT EXISTS ix_registration_payments_tournament_id
  ON public.registration_payments (tournament_id);

CREATE INDEX IF NOT EXISTS ix_registration_payments_registration_id
  ON public.registration_payments (registration_id);