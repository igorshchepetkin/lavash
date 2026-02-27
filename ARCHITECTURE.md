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
    admin/page.tsx                (admin tournaments)
    admin/t/[id]/registrations/page.tsx
    admin/t/[id]/ops/page.tsx
    api/
      tournaments/route.ts
      tournament/[id]/apply/route.ts
      tournament/[id]/mode/route.ts
      tournament/[id]/public/route.ts
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