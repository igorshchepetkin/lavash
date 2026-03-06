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
1) GET `/t/[id]/reserve-confirm` loads tournament mode and renders reserve confirmation form.
2) User enters:
   - phone,
   - confirmation code,
   - last name (SOLO) or any player name (TEAM).
3) UI submits POST `/api/tournament/[id]/reserve-confirm`.
4) API finds the registration by tournament + confirmation code (with case-insensitive fallback),
   verifies identity fields and calls reserve promotion logic.
5) Response returns:
   - `promoted: true` if user moved into main roster,
   - `promoted: false` if slot has already been taken and registration stays in reserve.
6) UI shows result, disables submit button and redirects back to showcase after countdown.

Admin flow:
1) /admin shows tournaments
2) /admin/t/[id]/registrations:
   - shows tournament header + registration stats (pending/accepted/total)
   - can add registration (only if not canceled/finished; ideally only draft)
3) /admin/t/[id]/ops:
   - "Start match" calls POST /api/admin/tournament/[id]/start
   - entering results calls POST /api/admin/tournament/[id]/game/result
   - finishing calls POST /api/admin/tournament/[id]/finish
   - cancel calls POST /api/admin/tournament/[id]/cancel

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
  - resets all `reserve_pending` registrations back to `reserve`

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
    t/[id]/withdraw/page.tsx      (public winthdraw form)
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
    reserve.ts                    (reserve queue / promotion helpers)

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
- Reserve controls:
  - accepting beyond capacity creates reserve registrations
  - reserve and reserve_pending can be unaccepted
  - judge can manually confirm promotion from `reserve_pending`

### /admin/t/[id]/ops
- Tournament status + actions:
  - Build teams (SOLO) (draft only, requires all accepted paid)
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
- (Optional/next) Players & seeding management block:
  - Before build-teams: admin can assign seed_team_index 1..8 per player (max 8, unique per team)
  - Before start: show bucket membership and final team assignment

### /t/[id] (showcase)
- In draft:
  - SOLO: before teams are built, shows accepted registrations list instead of team rating
  - TEAM: before match 1 starts, shows accepted registrations list instead of team rating
  - reserve registrations are displayed at bottom of the list, under divider “Резерв”
  - there is a public link to reserve confirmation page if any reserve exists
- After teams exist / after start:
  - shows team rating
- Current match:
  - 2x2 court grid like ops page
  - points label shown in card header as `Очки: +N`
  - winner/loser movement badges match ops visual style while next stage is not yet started

## Guards
- `getTournamentFlags(tournamentId)`:
  - started = status !== draft
  - canceled = status == canceled
- Registration ops:
  - disallow accept/reject/unaccept, manual add, strength edits, payments when tournament started
- Tournament ops:
  - build-teams and start require `assertAllAcceptedPaid(tournamentId)`

## First match seeding and strength-based placement
- SOLO team strength: sum of 3 players’ strengths from team_members.
- TEAM team strength: registration.strength via teams.registration_id -> registrations.strength.
- First match pairing uses strength ordering, with randomization for ties.

---

## Reserve model
Main roster capacity:
- SOLO = 24 registrations
- TEAM = 8 registrations

Statuses:
- `pending` — new application
- `accepted` — in main roster
- `reserve` — waiting in reserve queue
- `reserve_pending` — reserve invitation sent, waiting for confirmation
- `rejected` / `withdrawn` / `canceled` — terminal / excluded states

Acceptance behavior:
- judge pressing “Accept” does not always mean “accepted into main roster”
- if capacity already full, registration is put into `reserve`
- reserve registrations do not create players/teams/team_members and are excluded from team build / match start mechanics

Automatic promotion candidate:
- when a main roster slot becomes free:
  - SOLO: accepted count drops from 24 to 23
  - TEAM: accepted count drops from 8 to 7
- oldest `reserve` registration by `created_at` becomes `reserve_pending`

Confirmation:
- can be done by:
  - public user via `/api/tournament/[id]/reserve-confirm`
  - judge from admin registrations page
- promotion is race-safe:
  - if slot is free at confirmation moment → registration becomes `accepted`
  - otherwise registration returns to `reserve`

Start boundary:
- after first match starts, reserve remains only informational
- all `reserve_pending` are downgraded back to `reserve`
- no further promotion into main roster is allowed after tournament start