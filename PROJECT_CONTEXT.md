# Architecture — Lavash (MVP)

## Overview
A Next.js App Router project where:
- Client pages fetch server API routes for mutations
- API routes use supabaseAdmin (Service Role key) to write to DB
- Public pages are read-only except application endpoints

## Data flow
Public apply flow:
1) GET tournament page (/t/[id]) shows status + Apply button if allowed.
2) Public form (/t/[id]/apply) submits POST /api/tournament/[id]/apply.
3) API validates tournament not canceled and status == draft, inserts into registrations,
   returns confirmation_code.
4) UI shows “Код подтверждения”.

Public reserve confirm flow:
1) If a slot in main roster opens up, the oldest reserve registration is moved to `reserve_pending`.
2) Applicant opens `/t/[id]/reserve-confirm`.
3) Public form submits POST `/api/tournament/[id]/reserve-confirm`.
4) API verifies:
   - confirmation code (case-insensitive),
   - phone,
   - last name for SOLO or any one player name for TEAM.
5) API calls reserve promotion logic:
   - if slot is still free, registration becomes accepted and is promoted to main roster,
   - if slot is already occupied, registration remains in reserve.
6) UI shows success/result message and auto-returns to tournament showcase.

Admin flow:
1) /admin shows tournaments
2) /admin/t/[id]/registrations:
   - shows tournament header + registration stats (pending/accepted/total)
   - can add registration (only if not canceled/finished; ideally only draft)
   - accepts registrations into main roster or reserve depending on capacity
   - can confirm reserve promotion manually for `reserve_pending`
3) /admin/t/[id]/ops:
   - "Start match" calls POST /api/admin/tournament/[id]/start
   - entering results calls POST /api/admin/tournament/[id]/game/result
   - finishing calls POST /api/admin/tournament/[id]/finish
   - cancel calls POST /api/admin/tournament/[id]/cancel
   - SOLO: build teams calls POST /api/admin/tournament/[id]/build-teams
   - SOLO: reset teams calls POST /api/admin/tournament/[id]/reset-teams

## Match mechanics
- Every stage has 4 games (court 1..4)
- Result endpoint:
  - sets winner_team_id, score_text, points_awarded
  - increments winner team points
  - updates team_state: winner to court-1 (min 1), loser to court+1 (max 4)
  - DOES NOT auto-create next stage
- Start endpoint:
  - guards: previous stage must be complete
  - determines next stage number: lastStage.number + 1
  - creates stage
  - creates games:
    - stage 1: seededPairs optional + random fill from teams
    - stage 2+: pairs by team_state.current_court (2 teams per court)
  - updates tournament.status to live
  - before first stage starts, all `reserve_pending` registrations are returned back to `reserve`

## Finish mechanics
- Finish endpoint:
  - guards: not canceled, not finished
  - requires last stage complete
  - marks games of last stage is_final=true (optional for showcase)
  - sets tournament.status = finished

## Folder structure (typical)
src/
  app/
    page.tsx                      (public list)
    t/[id]/page.tsx               (showcase)
    t/[id]/apply/page.tsx         (public apply form)
    t/[id]/withdraw/page.tsx      (public withdraw form)
    t/[id]/reserve-confirm/page.tsx
    admin/page.tsx                (admin tournaments)
    admin/t/[id]/registrations/page.tsx
    admin/t/[id]/ops/page.tsx
    api/
      tournaments/route.ts
      tournament/[id]/apply/route.ts
      tournament/[id]/mode/route.ts
      tournament/[id]/public/route.ts
      tournament/[id]/reserve-confirm/route.ts
      tournament/[id]/withdraw/route.ts
      admin/
        login/route.ts
        logout/route.ts
        tournaments/route.ts
        tournament/[id]/apply/route.ts
        tournament/[id]/build-teams/route.ts
        tournament/[id]/reset-teams/route.ts
        tournament/[id]/cancel/route.ts
        tournament/[id]/finish/route.ts
        tournament/[id]/game/result/route.ts
        tournament/[id]/mode/route.ts
        tournament/[id]/points-overrides/route.ts
        tournament/[id]/registrations/route.ts
        tournament/[id]/registrations/accept/route.ts
        tournament/[id]/registrations/create/route.ts
        tournament/[id]/registrations/payment/route.ts
        tournament/[id]/registrations/strength/route.ts
        tournament/[id]/solo-players/route.ts
        tournament/[id]/solo-players/seed/route.ts
        tournament/[id]/start/route.ts
        tournament/[id]/state/route.ts
        tournament/[id]/withdraw/route.ts

  lib/
    supabaseAdmin.ts              (service role client)
    supabasePublic.ts
    payments.ts
    adminAuth.ts                  (cookie guard requireAdminOr401)
    requireAdmin.ts
    tournamentGuards.ts           (getTournamentFlags: canceled/started/finished/status)
    reserve.ts                    (reserve capacity / promotion logic)

## Key pages
### /admin (AdminHome)
- Login by token
- List tournaments
- Create tournament (name/date/time/mode + base points c1..c4 + points overrides (dynamic list))

### /admin/t/[id]/registrations
- View registrations list
- Accept / Reject / Unaccept (locked if tournament started)
- Strength control:
  - SOLO: per registration strength (player strength)
  - TEAM: per registration strength (team strength)
- Payments:
  - SOLO: single “Взнос” toggle when accepted
  - TEAM: 3 toggles, one per slot/person, with progress “взнос X/3”
- Manual add registration (draft only)
- Reserve-specific behavior:
  - if accepted count is already full, newly accepted registration goes to reserve
  - statuses:
    - `accepted` = in main roster
    - `reserve` = waiting in reserve
    - `reserve_pending` = invited to move from reserve to main roster, waiting for confirmation
  - admin can remove acceptance both from main roster and reserve
  - admin can manually confirm promotion for `reserve_pending`

### /admin/t/[id]/ops
- Tournament status + actions:
  - Build teams (SOLO) (draft only, requires all accepted paid)
  - Reset teams (SOLO) (draft only; deletes teams/team_members)
  - Start next match (requires stage complete; first match uses strength-based placement; requires all accepted paid)
  - Finish tournament (only after current stage complete)
  - Cancel tournament
- Points overrides editor (draft only, before match 1)
- Current match courts:
  - During start: spinner block
  - Each GameCard:
    - pick winner + score
    - save result with visible “saving…” indicator
    - saved courts get orange border
- Teams table (points)
- Players & seeding management block (SOLO, before match 1):
  - shows bucket membership and team assignment (after build)
  - allows setting seed_team_index 1..8 per player (max 8, unique per team) before build
  - strength and seeding are locked after build until reset

### /t/[id] (public showcase)
- Shows tournament status and current match
- Before teams exist / before match 1 in TEAM mode:
  - shows accepted registrations list instead of team rating
  - reserve registrations are shown at the bottom, marked “Резерв”
  - if reserve exists, shows link to reserve confirmation page
- After teams exist (SOLO) or after first match starts (TEAM):
  - shows team rating
- Current match courts:
  - 2x2 card grid
  - court points shown as `Очки: +N`
  - winner / loser movement badges shown like in ops while next stage has not started yet

## Guards
- `getTournamentFlags(tournamentId)`:
  - started = status !== draft
  - canceled = status == canceled
- Registration ops:
  - disallow accept/reject/unaccept, manual add, strength edits, payments when tournament started
- Tournament ops:
  - build-teams and start require `assertAllAcceptedPaid(tournamentId)`
  - reset-teams allowed only before start (draft)

## First match seeding and strength-based placement
- SOLO team strength: sum of 3 players’ strengths from team_members.
- TEAM team strength: registration.strength via teams.registration_id -> registrations.strength.
- First match pairing uses strength ordering, with randomization for ties.

---

## SOLO: deterministic buckets + one-time randomness
Bucket membership must be consistent across endpoints (build-teams, solo-players).

Deterministic player sort:
- strength DESC
- hash(player.id + tournamentId) ASC (FNV-1a 32-bit)
- id ASC

Bucket slices by position:
- 1..8   → bucket A (internal bucket=1)
- 9..16  → bucket B (internal bucket=2)
- 17..24 → bucket C (internal bucket=3)

Team composition randomness:
- build-teams shuffles pools inside each bucket before distributing to teams
- this is intended “one-time shuffle” when judge presses Build teams once

## Team naming and numbering (SOLO)
- In DB, team.name must not include letter prefix.
- team.name stored as "ФИО1 / ФИО2 / ФИО3".
- UI uses team_index (1..8) derived from teams ordering by created_at ASC.
- solo-players endpoint returns team_index and team_slot for each player (if teams exist).

## reset-teams endpoint (SOLO)
POST /api/admin/tournament/[id]/reset-teams:
- requires admin
- guards: not canceled, status == draft, mode == SOLO
- deletes team_members for tournament teams
- deletes teams for tournament
- returns ok

Purpose:
- allow judge to rebuild teams after adjusting strength or seeds

## Reserve roster logic
Capacity:
- SOLO main roster capacity = 24 accepted registrations
- TEAM main roster capacity = 8 accepted registrations

Acceptance:
- if judge accepts within capacity → registration.status = `accepted`
- if judge accepts above capacity → registration.status = `reserve`
- reserve registrations do not create players/teams/team_members and do not participate in tournament mechanics

Automatic invitation from reserve:
- when one main slot becomes free (SOLO: accepted count becomes 23; TEAM: accepted count becomes 7),
  the oldest reserve registration by `created_at` is moved to `reserve_pending`

Promotion confirmation:
- requires confirmation because applicant plans may change
- may be confirmed:
  - publicly via `/t/[id]/reserve-confirm`
  - by judge in admin registrations page
- if at confirmation time the main roster is already full, registration returns to `reserve`

Visibility:
- reserve and reserve_pending are not part of built teams / current tournament roster
- on public showcase before tournament start they are shown only in registrations list, marked as reserve
- reserve_pending is intentionally not visually distinguished from reserve on showcase
- after first match starts, reserve remains hidden from the showcase roster UI

Start boundary:
- when first match starts, all `reserve_pending` registrations are returned to `reserve`
- after start, promotion from reserve to main roster is no longer allowed

## Ops page UI state machine (SOLO)
Before match 1:
- if teams not built:
  - Build teams button enabled (guards apply)
  - strength and seed controls enabled
- if teams built:
  - Build button replaced with Reset teams
  - strength and seed controls disabled
During build/reset:
- show spinner (“бублик”) and disable button