# API Contract — Lavash (MVP)

This document defines JSON request/response formats and key guards for endpoints.

Conventions:
- All responses are JSON.
- Success responses include `{ ok: true, ... }`.
- Error responses include `{ ok: false, error: <string|object> }` with HTTP status 4xx/5xx.
- Admin endpoints require cookie admin=1 (requireAdminOr401).
- All endpoints must block if tournament.status == "canceled" (business rule).

## Admin auth
### POST /api/admin/login
Purpose: set admin cookie (MVP).
Request: `{ code: string }` (or empty if MVP simplified)
Response: `{ ok: true }`

### POST /api/admin/logout
Purpose: clear admin cookie.
Response: `{ ok: true }`

---

## Tournaments

### GET /api/admin/tournaments
Auth: admin
Response:
```json
{
  "ok": true,
  "items": [
    {
      "id": "uuid",
      "name": "Lavash 2026-02-26",
      "date": "2026-02-26T12:00:00Z",
      "registration_mode": "TEAM|SOLO",
      "status": "draft|live|finished|canceled",
      "points_c1": 4,
      "points_c2": 3,
      "points_c3": 2,
      "points_c4": 1
    }
  ]
}

### POST /api/admin/tournaments
Auth: admin
Request:

{
  "name": "Lavash #12",
  "date": "2026-03-01T12:00:00Z",
  "registration_mode": "TEAM|SOLO",
  "points_c1": 4,
  "points_c2": 3,
  "points_c3": 2,
  "points_c4": 1
}

Response:
{ "ok": true, "id": "uuid" }

### POST /api/admin/tournament/[id]/cancel
Auth: admin
Guards:
blocked if already finished (optional; you may allow cancel only if not finished)
irreversible

Response:
{ "ok": true }

### POST /api/admin/tournament/[id]/finish
Auth: admin
Guards:
status != canceled
status != finished
last stage exists
last stage complete (all games have winner_team_id)

Effects:
set games of last stage is_final=true (optional)
tournaments.status="finished"

Response:
{ "ok": true }
State for judge/admin UI

### GET /api/admin/tournament/[id]/state
Auth: admin
Response:
{
  "ok": true,
  "tournament": {
    "id": "uuid",
    "name": "Lavash #12",
    "date": "2026-03-01T12:00:00Z",
    "registration_mode": "TEAM|SOLO",
    "status": "draft|live|finished|canceled",
    "points_c1": 4,
    "points_c2": 3,
    "points_c3": 2,
    "points_c4": 1
  },
  "latestStage": { "id": "uuid", "number": 1 } | null,
  "teams": [
    { "id": "uuid", "name": "P1 / P2 / P3", "points": 7 }
  ],
  "games": [
    {
      "id": "uuid",
      "stage_id": "uuid",
      "court": 1,
      "team_a_id": "uuid",
      "team_b_id": "uuid",
      "winner_team_id": "uuid|null",
      "score_text": "6-4",
      "points_awarded": 4,
      "is_final": false
    }
  ]
}

## Match start (judge)
### POST /api/admin/tournament/[id]/start
Auth: admin

Purpose:
Create next stage and its 4 games.

Rules:
No auto-starting on result save.

Allowed only if:
tournament not canceled/finished
previous stage either doesn't exist OR is complete

Pairing:
If stage #1: seededPairs optional + random fill.
If stage #2+: pair teams by team_state.current_court (2 teams per court).

Request (MVP):
{
  "seededPairs": [
    { "court": 1, "teamA": "uuid", "teamB": "uuid" }
  ]
}

Response:
{ "ok": true, "stageNumber": 2 }

Errors:
{ ok:false, error:"Previous match is not complete" }
{ ok:false, error:"Нужно 8 команд..." }

## Game result (judge)
### POST /api/admin/tournament/[id]/game/result
Auth: admin

Purpose:
Save game winner + score (optional)
Award points for this court to winner

Update team_state movement:
winner: court-1 (min 1)
loser: court+1 (max 4)

Important:
MUST NOT create next stage automatically.

Request:
{
  "gameId": "uuid",
  "winnerTeamId": "uuid",
  "scoreText": "6-4"
}

Response:
{ "ok": true, "stageComplete": false }

Errors:
tournament finished/canceled
already scored
winnerTeamId not part of this game

## Registrations — public apply
### POST /api/tournament/[id]/apply
Auth: public
Guards:
tournament not canceled
tournament.status == draft

Request TEAM:
{
  "mode": "TEAM",
  "team_player1": "Фамилия Имя",
  "team_player2": "Фамилия Имя",
  "team_player3": "Фамилия Имя",
  "phone": "+7..."
}

Request SOLO:
{
  "mode": "SOLO",
  "solo_last_name": "Иванов",
  "solo_first_name": "Иван",
  "phone": "+7..."
}

Response:
{ "ok": true, "confirmation_code": "ABC123" }

Notes:
API computes full_name for display.
For SOLO, default strength=3.
status defaults to pending.

## Registrations — admin management (suggested)
### GET /api/admin/tournament/[id]/registrations
Auth: admin

Response:
{
  "ok": true,
  "tournament": { ... },
  "items": [
    {
      "id": "uuid",
      "status": "pending|accepted|rejected|withdrawn",
      "full_name": "A / B / C",
      "phone": "+7...",
      "strength": 3
    }
  ]
}

### POST /api/admin/tournament/[id]/registrations/create
Auth: admin
Guards:
tournament.status == draft (recommended)
Request: same as public apply (TEAM/SOLO)

Response:
{ "ok": true, "id": "uuid", "confirmation_code": "ABC123" }

### POST /api/admin/tournament/[id]/registrations/accept
Auth: admin
Guards:
tournament.status == draft

Request:
{ "registrationId": "uuid" }

Response:
{ "ok": true }

### POST /api/admin/tournament/[id]/registrations/reject
Auth: admin
Guards:
tournament.status == draft

Request:
{ "registrationId": "uuid" }

Response:
{ "ok": true }

### POST /api/admin/tournament/[id]/registrations/unaccept (optional)
Auth: admin
Guards:
tournament.status == draft

Request:
{ "registrationId": "uuid" }

Response:
{ "ok": true }

### POST /api/tournament/[id]/withdraw (optional)
Auth: public
Guards:
tournament.status == draft

Request:
{ "confirmation_code": "ABC123" }

Response:
{ "ok": true }

----------

Notes / future improvements

Replace admin cookie with Supabase Auth + RLS.
Add RLS policies for public reads/writes.
Add uniqueness constraints (e.g., prevent duplicate SOLO by phone+name).
Add audit log.