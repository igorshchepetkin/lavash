# Lavash Tournament App — Project Context (MVP)

## Goal
Web app to manage “Lavash” tennis club tournaments.

Tournament format:
- 8 teams, 3 players per team (team name format: "ФИО1 / ФИО2 / ФИО3")
- 4 courts => 4 simultaneous games per match ("матч" = round)
- Court 1 is the strongest, court 4 is the weakest
- After each game:
  - Winner moves UP to a stronger court (court-1)
  - Loser moves DOWN to a weaker court (court+1)
  - Clamp within [1..4]
- New match is created ONLY by judge pressing “Start” (no automatic match creation on result save)
- Tournament ends ONLY by judge pressing “Finish tournament”
- Tournament can be canceled. Canceled tournament blocks any operations.

## Tech stack
- Next.js (App Router) + TypeScript
- Tailwind CSS (responsive desktop + mobile)
- Supabase Postgres as DB
- Supabase Admin key used server-side for all DB writes in API routes (MVP)
- Simple admin auth via cookie ("admin"="1") — no real user accounts in MVP

## Tournament lifecycle / statuses
`tournaments.status`:
- draft: registrations open, judge can manage registrations, build teams, prepare, cancel
- live: tournament started, matches can be created by Start button, results can be entered
- finished: tournament is completed (by Finish button)
- canceled: tournament canceled (irreversible)

Blocked operations:
- if canceled: all judge/public operations blocked
- if finished: no more starts/results/registrations

## Registration modes
`tournaments.registration_mode`:
- TEAM: public/adm submits a team (3 players) + applicant phone
- SOLO: public/adm submits a single player (last_name + first_name) + phone
  - judge sets "strength" (1..5) later; default 3 on submit

Registration record stores:
- SOLO: solo_first_name, solo_last_name, full_name (computed), phone, strength, status
- TEAM: team_player1..3, full_name (computed), phone, status
- confirmation_code: code shown after submit (used later for withdraw/confirm flows)

Registration statuses (MVP):
- pending
- accepted
- rejected
- withdrawn
(Only allowed while tournament not started; exact allowed transitions controlled in API)

## Core entities and how they interact
- tournaments: settings, points per court, status
- registrations: applications from public or admin
- teams: once created/accepted, 8 teams exist for the tournament
- team_state: current court assignment per team (used to build next match)
- stages: matches/rounds; each stage has number=1..N
- games: 4 games per stage (one per court). Each game references two teams and winner.

Key principle:
- `game/result` updates the winner + team points + updates team_state movements.
- `start` creates a new stage and 4 games. For stage #1 it uses randomization (plus optional seeds),
  for stage #2+ it pairs teams by `team_state.current_court` (2 teams per court).

## Admin UI pages (suggested structure)
- /admin                      — tournament list + create tournament
- /admin/t/[id]/registrations  — view registrations + accept/reject + add registration (disabled if canceled/finished)
- /admin/t/[id]/ops            — judge screen (Start match, enter results, Finish tournament, Cancel tournament)

## Public UI pages
- /                           — list tournaments newest first with statuses and "Apply" if allowed
- /t/[id]                     — tournament showcase (teams, current match, ranking, results)
- /t/[id]/apply               — public application form (TEAM or SOLO)
- /t/[id]/cancel              — optional: withdraw application by confirmation_code (MVP optional)

## Important API endpoints (MVP)
Admin:
- POST /api/admin/tournaments
- GET  /api/admin/tournaments
- GET  /api/admin/tournament/[id]/state
- POST /api/admin/tournament/[id]/cancel
- POST /api/admin/tournament/[id]/finish
- POST /api/admin/tournament/[id]/start
- POST /api/admin/tournament/[id]/build-teams   (SOLO randomization / seeding)
- POST /api/admin/tournament/[id]/game/result   (save winner + points + update team_state)
- POST /api/admin/tournament/[id]/registrations/create
- POST /api/admin/tournament/[id]/registrations/accept
- POST /api/admin/tournament/[id]/registrations/reject
- POST /api/admin/tournament/[id]/registrations/unaccept (optional)

Public:
- POST /api/tournament/[id]/apply
- POST /api/tournament/[id]/withdraw (optional)

## Guard rules (important)
Always block if tournament.status == "canceled".
Block operations requiring "before start" when tournament.status != "draft".
Block operations requiring "during tournament" when tournament.status != "live".
Block any new matches or results when tournament.status == "finished".

## Known MVP simplifications
- No real user accounts; admin auth via cookie.
- Public endpoints still use server-side supabase admin key (API enforces business rules).
- No timer/clock logic.

## Roles
- **Public user**: submits registration (SOLO or TEAM), can withdraw by cancel_code (if enabled).
- **Admin / Judge**: logs in via ADMIN_TOKEN, manages tournaments and operations.

## Tournament lifecycle
- `draft`: registrations are open, admin can accept/reject, manage strength, mark payments, edit points overrides, build teams (SOLO), seed players.
- `live`: tournament started (at least one stage created). Registrations and payments are locked. Matches proceed.
- `finished`: tournament ended. No new stages/results.
- `canceled`: tournament canceled permanently. All operations are locked.

## Modes
### SOLO
- Users register as individual players.
- Admin accepts registrations -> creates rows in `players`.
- Team building creates 8 teams and fills 3 slots each using players.
- Team strength is computed as sum of players’ strengths in its 3 slots.

### TEAM
- Users register as a team (3 names).
- Admin accepts registrations -> creates 3 players + team + team_members linked to registration.
- Team strength is set by admin on the registration (single value for the whole team).

## Payments
Participants pay an entry fee.
- Payment can be confirmed **only for accepted registrations**.
- Payment confirmation is stored per participant:
  - SOLO: one participant => 1 payment flag.
  - TEAM: 3 participants => 3 payment flags (one per slot / player name).
- Reverting acceptance (unaccept) returns status to pending but **does not automatically clear payment**.
- Rejecting a registration **clears payment confirmations**:
  - SOLO: clears payment for this registration.
  - TEAM: clears payments for all 3 participants.
- If a registration has payment confirmations and admin tries to reject it, UI asks for confirmation.

Important guard:
- **Any accepted registration without payment must not be allowed to participate**:
  - team building (SOLO) and tournament start are guarded by `assertAllAcceptedPaid(tournamentId)`.

## Points by courts
Tournament has base points per court (c1..c4).  
Additionally, admin can set **points overrides per match number**:
- Example: match 1 and match 2 give 1 point on each court regardless of base points.
- Overrides are editable only before match 1 is started.

## Match stages (“Матч №N”)
- Each stage has 4 games (courts 1..4).
- Stage completion means all 4 games have a winner.
- Next stage can be started only when previous stage is complete.

## UX / UI notes
- Admin registrations page:
  - Add registration (manual) only when tournament is draft and not started/canceled/finished.
  - When tournament started (status != draft), registrations are locked:
    - cannot add registrations
    - cannot accept/reject/unaccept
    - cannot mark payments
    - cannot change strength
- Ops page:
  - “Start match” shows spinner and “starting…” block while request in flight.
  - “Save result” shows “saving…” indicator instead of disabled silent button.
  - Courts with saved result are visually highlighted (orange border).
  - Points overrides “Save” is disabled when there are no overrides to save.

## Team placement for first match
When starting first stage (no lastStage):
- Teams are ordered by strength (desc).
- Ties are resolved randomly inside equal-strength groups.
- Placement:
  - strongest pair -> court 4
  - next -> court 3
  - next -> court 2
  - weakest -> court 1