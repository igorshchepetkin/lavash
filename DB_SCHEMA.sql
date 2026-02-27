-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

-- =========================
-- GAMES
-- =========================
-- games.points_awarded stores awarded points resolved using overrides (if any) or base points.
CREATE TABLE public.games (
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

-- =========================
-- PLAYERS (with seeding)
-- =========================
CREATE TABLE public.players (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL,
  full_name text NOT NULL,
  strength integer NOT NULL DEFAULT 3 CHECK (strength >= 1 AND strength <= 5),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  registration_id uuid,
  seed_team_index integer CHECK (seed_team_index IS NULL OR seed_team_index >= 1 AND seed_team_index <= 8),
  seed_slot integer CHECK (seed_slot IS NULL OR seed_slot >= 1 AND seed_slot <= 3),
  CONSTRAINT players_pkey PRIMARY KEY (id),
  CONSTRAINT players_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id),
  CONSTRAINT players_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES public.registrations(id)
);

-- =========================
-- PAYMENTS (per registration + slot)
-- =========================
-- This table stores payment confirmations.
-- SOLO uses slot=1, TEAM uses slot=1..3.
CREATE TABLE public.registration_payments (
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

-- =========================
-- REGISTRATIONS
-- =========================
-- Fields used:
-- status: pending | accepted | rejected | withdrawn
-- mode: SOLO | TEAM
-- strength: used for SOLO player strength and TEAM team strength
-- team_player1..3, solo_* fields, confirmation_code, phone
CREATE TABLE public.registrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode = ANY (ARRAY['TEAM'::text, 'SOLO'::text])),
  team_player1 text,
  team_player2 text,
  team_player3 text,
  solo_player text,
  strength integer CHECK (strength >= 1 AND strength <= 5),
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'withdrawn'::text, 'canceled'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  confirmation_code text,
  solo_first_name text,
  solo_last_name text,
  phone text,
  CONSTRAINT registrations_pkey PRIMARY KEY (id),
  CONSTRAINT registrations_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id)
);

CREATE TABLE public.stages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL,
  number integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT stages_pkey PRIMARY KEY (id),
  CONSTRAINT stages_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id)
);

-- =========================
-- TEAMS / TEAM_MEMBERS
-- =========================
-- teams.registration_id used for TEAM mode (accepted -> created team linked to registration)
-- team_members: slots 1..3, unique player_id
CREATE TABLE public.team_members (
  team_id uuid NOT NULL,
  player_id uuid NOT NULL UNIQUE,
  slot integer NOT NULL CHECK (slot >= 1 AND slot <= 3),
  CONSTRAINT team_members_pkey PRIMARY KEY (team_id, slot),
  CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT team_members_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id)
);

CREATE TABLE public.team_state (
  tournament_id uuid NOT NULL,
  team_id uuid NOT NULL,
  current_court integer NOT NULL CHECK (current_court >= 1 AND current_court <= 4),
  CONSTRAINT team_state_pkey PRIMARY KEY (tournament_id, team_id),
  CONSTRAINT team_state_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id),
  CONSTRAINT team_state_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
);

CREATE TABLE public.teams (
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

-- =========================
-- POINTS OVERRIDES (per stage/match number)
-- =========================
CREATE TABLE public.tournament_points_overrides (
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

-- =========================
-- TOURNAMENTS
-- =========================
-- Important fields used by app:
-- status: draft | live | finished | canceled
-- registration_mode: SOLO | TEAM
-- points_c1..points_c4: base points per court
CREATE TABLE public.tournaments (
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