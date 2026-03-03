# API Contract (generated)

Generated: 2026-03-01 19:31:42

---

## /api/admin/login

- **File (from src):** app\api\admin\login\route.ts
- **Route:** /api/admin/login

### Description

src/app/api/admin/login/route.ts
Purpose: Admin authentication entrypoint (token-based).
Algorithm:
1. Parse JSON body and read `token`.
2. Compare `token` against `process.env.ADMIN_TOKEN`.
3. If missing/mismatched -> return 401 with `{ ok:false, error:"Bad token" }`.
4. If valid -> return `{ ok:true }` and set an `admin=1` cookie with `httpOnly`, `sameSite:lax`, `path:/` (server-side session marker for further admin-guarded endpoints).
Outcome: establishes a lightweight admin session via cookie without storing anything in DB.

### Methods

#### POST

- **Handler signature:** export async function POST(req: Request)
- **Query params:** _not detected_
- **Body fields:** token
- **Response (snippet):**

```ts
{ ok: false, error: "Bad token" }
```

---

## /api/admin/logout

- **File (from src):** app\api\admin\logout\route.ts
- **Route:** /api/admin/logout

### Description

src/app/api/admin/logout/route.ts
Purpose: Admin logout / session invalidation.
Algorithm:
1. Return `{ ok:true }`.
2. Overwrite `admin` cookie with empty value and `maxAge:0` (immediate expiry) while keeping `httpOnly`, `sameSite:lax`, `path:/`.
Outcome: removes the admin session marker so subsequent admin endpoints fail authorization.

### Methods

#### POST

- **Handler signature:** export async function POST()
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: true }
```

---

## /api/admin/tournament/[id]/apply

- **File (from src):** app\api\admin\tournament\[id]\apply\route.ts
- **Route:** /api/admin/tournament/[id]/apply

### Description

src/app/api/admin/tournament/[id]/apply/route.ts
Purpose: Create a new registration for a tournament (mode-aware), returning a cancel code.
Key behavior: does NOT enforce admin auth; it is located under `/admin/...` but behaves like a вЂњmanual add / kioskвЂќ apply endpoint.
Algorithm:
1. Read `tournamentId` from route params and fetch tournament flags via `getTournamentFlags()`.
2. Block if tournament is canceled or already started.
3. Load tournament `registration_mode` from DB to decide SOLO vs TEAM registration payload schema.
4. Generate a random `cancel_code` (10 chars, excluding ambiguous symbols).
5. If SOLO: validate `solo_player` name and numeric `strength` (clamp 1..5, default 3) -> insert `registrations` row with `mode:"SOLO"`, `status:"pending"`, `cancel_code`.
6. If TEAM: validate 3 player names -> insert `registrations` row with `mode:"TEAM"`, `status:"pending"`, `cancel_code`.
7. Return `{ ok:true, registration_id, cancel_code }`.
Outcome: creates a pending registration; acceptance and entity creation (players/teams) happens elsewhere.

### Methods

#### POST

- **Handler signature:** export async function POST( req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "Tournament canceled" }
```

---

## /api/admin/tournament/[id]/build-teams

- **File (from src):** app\api\admin\tournament\[id]\build-teams\route.ts
- **Route:** /api/admin/tournament/[id]/build-teams

### Description

src/app/api/admin/tournament/[id]/build-teams/route.ts
Purpose: Build 8 balanced teams (A..H) from 24 SOLO players, with optional manual seeding, before tournament start.
Preconditions:
Admin required (`requireAdminOr401`).
Tournament must be `draft` and not canceled (`getTournamentFlags`).
All accepted registrations must be paid (`assertAllAcceptedPaid`).
Tournament `registration_mode` must be `SOLO`.
Teams must not exist yet (prevents rebuilding without reset).
Core algorithm:
1. Fetch 24 players for the tournament (`players` table), including `strength` and optional seed fields `seed_team_index` (1..8) and `seed_slot` (1..3). Reject if player count != 24.
2. Deterministic ranking for bucket assignment:
Normalize strength into [1..5].
Sort by strength desc, then by deterministic FNV-1a hash of `(playerId + tournamentId)` asc, then by `id` as final tie-break.
This makes the вЂњtop/mid/bottomвЂќ segmentation stable across endpoints.
3. Split sorted list into 3 buckets of 8 players each (bucket1 strongest, bucket2 middle, bucket3 weakest).
4. Create 8 empty `teams` rows for the tournament.
5. Apply seeds (manual placements):
Take all players with `seed_team_index != null`.
Enforce max 8 seeded players and forbid duplicate `seed_team_index` in the request set.
For each seeded player, assign them into the requested team index (1..8) and into a free slot (preferred `seed_slot` if available, otherwise first free).
Track used players, occupied slots, and вЂњbucket already used by teamвЂќ to preserve bucket diversity.
6. Fill remaining slots per team using bucket pools:
Build pool1/pool2/pool3 from remaining players per bucket (excluding seeded).
Shuffle within each bucket (bucket membership is deterministic; only intra-bucket order is randomized).
First pass per team: try to take one player from each bucket not yet used by that team.
Second pass: if still not full (because a bucket ran out), fill from any pool, preferring unused buckets first, then any.
7. Validate output: must assign exactly 24 members (8 teams * 3 slots). Extra safety check: ensure no team has duplicate buckets (should be impossible when buckets are healthy).
8. Insert `team_members` rows.
9. Generate team display names by joining member names in slot order (`"P1 / P2 / P3"`) and update `teams.name`.
Outcome: Creates balanced SOLO teams with stable bucket logic + optional manual seeding, ready for tournament start.

### Methods

#### POST

- **Handler signature:** export async function POST( _req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "NOT_ADMIN" }
```

---

## /api/admin/tournament/[id]/cancel

- **File (from src):** app\api\admin\tournament\[id]\cancel\route.ts
- **Route:** /api/admin/tournament/[id]/cancel

### Description

src/app/api/admin/tournament/[id]/cancel/route.ts
Purpose: Cancel a tournament and invalidate all registrations.
Algorithm:
1. Require admin (`requireAdminOr401`).
2. Load tournament status; if not found -> 404; if already canceled -> `{ ok:true }`.
3. Update tournament `status` to `"canceled"`.
4. Bulk update all `registrations` of this tournament to `status:"canceled"`.
Outcome: Tournament is permanently marked canceled; registrations are also marked canceled for consistent downstream UI/state.

### Methods

#### POST

- **Handler signature:** export async function POST( _req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "NOT_ADMIN" }
```

---

## /api/admin/tournament/[id]/finish

- **File (from src):** app\api\admin\tournament\[id]\finish\route.ts
- **Route:** /api/admin/tournament/[id]/finish

### Description

src/app/api/admin/tournament/[id]/finish/route.ts
Purpose: Finalize a tournament (mark it finished) only when the last match is fully scored.
Algorithm:
1. Require admin (`requireAdminOr401`).
2. Block if tournament canceled; if already finished -> `{ ok:true }`.
3. Fetch the latest stage by `number` desc. If no stages exist -> reject (вЂњno match has startedвЂќ).
4. Load all games for the latest stage and verify completeness: each game must have `winner_team_id`. If any missing -> reject (вЂњnot all results enteredвЂќ).
5. Mark all games in the latest stage as `is_final:true` (used by the public showcase to highlight final match set).
6. Update tournament status to `"finished"`.
Outcome: Tournament moves into a terminal вЂњfinishedвЂќ state; final games are flagged for the public view.

### Methods

#### POST

- **Handler signature:** export async function POST(_req: Request, context: any)
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "NOT_ADMIN" }
```

---

## /api/admin/tournament/[id]/game/result

- **File (from src):** app\api\admin\tournament\[id]\game\result\route.ts
- **Route:** /api/admin/tournament/[id]/game/result

### Description

src/app/api/admin/tournament/[id]/game/result/route.ts
Purpose: Submit a game result, award points, and update вЂњcourt movementвЂќ state for the two teams.
Preconditions:
Admin required.
Tournament not canceled and not finished.
Game must exist, belong to tournament flow, and not already scored.
Algorithm:
1. Parse `{ gameId, winnerTeamId, scoreText }`. Validate required fields.
2. Load tournament base points configuration (`points_c1..points_c4`) and game record (teams, court, stage_id, winner).
3. Validate `winnerTeamId` is either `team_a_id` or `team_b_id`.
4. Determine stage number (read from `stages` by `stage_id`).
5. Resolve points for this court:
Start with tournament base points by court (1..4).
If stageNumber is known, check `tournament_points_overrides` for that (tournamentId, stageNumber).
If override exists, replace points_c1..c4 from override.
Choose the points value for `g.court`.
6. Persist game result: set `winner_team_id`, optional `score_text`, and `points_awarded` (no auto вЂњnext stageвЂќ here).
7. Increment winner teamвЂ™s `teams.points` by awarded points.
8. Update `team_state` movement:
Winner moves вЂњupвЂќ one court (court-1, clamped to [1..4]).
Loser moves вЂњdownвЂќ one court (court+1, clamped to [1..4]).
9. Compute `stageComplete` by checking if every game in this stage has a winner; return it to help UI decide whether вЂњStart next matchвЂќ can be enabled.
Outcome: Atomic-ish update across games, teams, and team_state that drives both scoring and court progression mechanics.

### Methods

#### POST

- **Handler signature:** export async function POST(req: Request, context: { params: Promise<{ id: string }> })
- **Query params:** _not detected_
- **Body fields:** gameId, scoreText, winnerTeamId
- **Response (snippet):**

```ts
{ ok: false, error: "NOT_ADMIN" }
```

---

## /api/admin/tournament/[id]/mode

- **File (from src):** app\api\admin\tournament\[id]\mode\route.ts
- **Route:** /api/admin/tournament/[id]/mode

### Description

src/app/api/admin/tournament/[id]/mode/route.ts
Purpose: Read-only admin helper to fetch a tournament registration mode.
Algorithm:
1. Read tournamentId from params.
2. Query `tournaments.registration_mode`.
3. Return `{ ok:true, registration_mode }` or 404 if not found.
Outcome: Lightweight endpoint for admin UI to branch logic between SOLO and TEAM flows.

### Methods

#### GET

- **Handler signature:** export async function GET( _req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "Not found" }
```

---

## /api/admin/tournament/[id]/players/strength

- **File (from src):** app\api\admin\tournament\[id]\players\strength\route.ts
- **Route:** /api/admin/tournament/[id]/players/strength

### Description

src/app/api/admin/tournament/[id]/players/strength/route.ts
Purpose: Update a SOLO playerвЂ™s strength (rating) before the tournament starts.
Preconditions:
Admin required.
Tournament must not be canceled and must not be started (`getTournamentFlags`).
Algorithm:
1. Parse `{ playerId, strength }`, clamp strength to [1..5].
2. Verify the player exists and belongs to this tournament (`players` by id + tournament_id).
3. Update `players.strength` for that player.
Outcome: Adjusts player rating used by deterministic bucket assignment and team balancing algorithms prior to team building / start.

### Methods

#### POST

- **Handler signature:** export async function POST( req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "NOT_ADMIN" }
```

---

## /api/admin/tournament/[id]/points-overrides

- **File (from src):** app\api\admin\tournament\[id]\points-overrides\route.ts
- **Route:** /api/admin/tournament/[id]/points-overrides

### Description

src/app/api/admin/tournament/[id]/points-overrides/route.ts
Purpose: Manage per-stage point overrides (by court) before tournament start.
GET algorithm:
1. Require admin.
2. Fetch overrides for tournament ordered by `stage_number`.
3. Return `{ ok:true, overrides:[{stage_number, points_c1..points_c4}] }`.
POST algorithm (replace-all synchronization):
4. Require admin; block if tournament canceled or started.
5. Parse `overrides` array from body and normalize numbers:
Keep only rows with finite stage_number>=1 and finite points_c1..c4.
Attach `tournament_id`.
6. Delete all existing overrides for the tournament (simple вЂњreset then insertвЂќ policy).
7. Insert normalized overrides if any remain.
Outcome: Provides a deterministic вЂњsingle source of truthвЂќ override set, used by scoring endpoint to compute awarded points.

### Methods

#### GET

- **Handler signature:** export async function GET(_req: Request, context: { params: Promise<{ id: string }> })
- **Query params:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "NOT_ADMIN" }
```

#### POST

- **Handler signature:** export async function POST(req: Request, context: { params: Promise<{ id: string }> })
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "NOT_ADMIN" }
```

---

## /api/admin/tournament/[id]/registrations/accept

- **File (from src):** app\api\admin\tournament\[id]\registrations\accept\route.ts
- **Route:** /api/admin/tournament/[id]/registrations/accept

### Description

src/app/api/admin/tournament/[id]/registrations/accept/route.ts
Purpose: Legacy/simplified вЂњaccept registrationвЂќ endpoint.
Notes: overlaps with the richer POST action handler in `/registrations/route.ts`.
Algorithm:
1. Enforce admin (`requireAdmin`).
2. Parse `{ registrationId }` and load the registration row.
3. Update `registrations.status` -> `accepted`.
4. Create players according to registration mode:
SOLO: insert 1 player (strength defaults to `reg.strength ?? 3`).
TEAM: insert players for provided names (strength hardcoded to 3 here).
Outcome: Marks a registration accepted and materializes `players`; does not create `teams`/`team_members` for TEAM mode (unlike the newer orchestration endpoint).

### Methods

#### POST

- **Handler signature:** export async function POST( req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Body fields:** registrationId
- **Response (snippet):**

```ts
{ ok: false, error: e1 }
```

---

## /api/admin/tournament/[id]/registrations/create

- **File (from src):** app\api\admin\tournament\[id]\registrations\create\route.ts
- **Route:** /api/admin/tournament/[id]/registrations/create

### Description

src/app/api/admin/tournament/[id]/registrations/create/route.ts
Purpose: Admin-side creation of a pending registration with a confirmation code (mode-aware).
Preconditions: admin required; tournament not canceled and not started.
Algorithm:
1. Load tournament registration_mode.
2. Generate a random `confirmation_code` (10 chars).
3. If SOLO: validate last/first name and E.164-like phone (must start with '+'); build `solo_player = "Last First"`.
4. Insert into `registrations` with `status:"pending"`, `strength:3` default, store `solo_*` fields and phone.
5. If TEAM: validate 3 names + phone; insert `registrations` row with team_player1..3, `status:"pending"`, and confirmation_code.
6. Return `{ ok:true, registration_id, confirmation_code }`.
Outcome: Creates a вЂњmanual/admin-enteredвЂќ registration that can later be accepted and paid, using the same pipeline as public registrations.

### Methods

#### POST

- **Handler signature:** export async function POST(req: Request, context: any)
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "NOT_ADMIN" }
```

---

## /api/admin/tournament/[id]/registrations/payment

- **File (from src):** app\api\admin\tournament\[id]\registrations\payment\route.ts
- **Route:** /api/admin/tournament/[id]/registrations/payment

### Description

src/app/api/admin/tournament/[id]/registrations/payment/route.ts
Purpose: Admin toggles payment status per registration slot (supports TEAM slot 1..3; SOLO slot 1 only).
Preconditions: admin required; tournament not canceled and not started.
Algorithm:
1. Parse `{ registrationId, slot, paid }` and validate slot in [1..3].
2. Ensure registration exists for this tournament.
3. Enforce policy: payment can be recorded only if registration status is `accepted`.
4. Enforce SOLO constraint: only slot=1 allowed.
5. Upsert into `registration_payments` on conflict `(registration_id, slot)` with fields:
paid boolean
paid_at timestamp if paid=true, else null
tournament_id, registration_id, slot
Outcome: Stores payment confirmation in a normalized slot-based table, used by вЂњstart/buildвЂќ guards (paid acceptance checks).

### Methods

#### POST

- **Handler signature:** export async function POST(req: Request, context: { params: Promise<{ id: string }> })
- **Query params:** _not detected_
- **Body fields:** paid, registrationId, slot
- **Response (snippet):**

```ts
{ ok: false, error: "NOT_ADMIN" }
```

---

## /api/admin/tournament/[id]/registrations

- **File (from src):** app\api\admin\tournament\[id]\registrations\route.ts
- **Route:** /api/admin/tournament/[id]/registrations

### Description

src/app/api/admin/tournament/[id]/registrations/route.ts
Purpose: Admin endpoint to view and manage registrations, plus create/rollback accepted entities.
GET algorithm (dashboard snapshot):
1. Require admin.
2. Load tournament core fields (id/name/date/start_time/mode/status).
3. Load registrations ordered by creation time, including mode-specific fields, phone, strength, and confirmation_code.
4. Load tournament flags (`getTournamentFlags`) to drive UI controls.
5. Load payment rows from `registration_payments` (slot-level paid status).
6. Return `{ tournament, registrations, flags, payments }`.
POST algorithm (state transitions):
7. Require admin; block if canceled or started.
8. Parse `{ registrationId, action }` where action в€€ { "accept", "reject", "unaccept" }.
9. Load the registration row.
10. If `reject`:
Reset any payment rows to unpaid (paid=false, paid_at=null).
Update registration status -> `rejected`.
11. If `unaccept` (rollback acceptance):
Only allowed if status currently `accepted`.
Find teams linked to this registration (`teams.registration_id`).
Delete `team_members` then `teams` for those teamIds (TEAM flow).
Delete `players` linked to this registration (`players.registration_id`) (both TEAM and SOLO flows).
Set registration status back to `pending`.
12. If `accept`:
Update registration status -> `accepted`.
If SOLO: insert a single `players` row tied to registration (`registration_id`, strength default 3).
If TEAM:
a) Validate 3 team player names.
b) Insert 3 `players` rows linked to this registration.
c) Create a `teams` row linked to this registration, name = `"P1 / P2 / P3"`.
d) Insert `team_members` mapping each player to slot 1..3.
Outcome: This endpoint is the central orchestration point where accepting/unaccepting registrations creates or deletes the downstream entities used by team building and tournament play.

### Methods

#### GET

- **Handler signature:** export async function GET( _req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "NOT_ADMIN" }
```

#### POST

- **Handler signature:** export async function POST( req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Body fields:** action, registrationId
- **Response (snippet):**

```ts
{ ok: false, error: "NOT_ADMIN" }
```

---

## /api/admin/tournament/[id]/registrations/strength

- **File (from src):** app\api\admin\tournament\[id]\registrations\strength\route.ts
- **Route:** /api/admin/tournament/[id]/registrations/strength

### Description

src/app/api/admin/tournament/[id]/registrations/strength/route.ts
Purpose: Admin sets/adjusts a registrationвЂ™s declared strength before tournament start (both TEAM and SOLO).
Preconditions: admin required; tournament not canceled and not started.
Algorithm:
1. Parse `{ registrationId, strength }` and clamp strength to [1..5].
2. Verify the registration exists for this tournament.
3. Update `registrations.strength` with the normalized value.
Outcome: Adjusts the strength reference used later when creating players/teams (and for strength-based initial seeding in first match).

### Methods

#### POST

- **Handler signature:** export async function POST( req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Body fields:** registrationId, strength
- **Response (snippet):**

```ts
{ ok: false, error: "NOT_ADMIN" }
```

---

## /api/admin/tournament/[id]/reset-teams

- **File (from src):** app\api\admin\tournament\[id]\reset-teams\route.ts
- **Route:** /api/admin/tournament/[id]/reset-teams

### Description

src/app/api/admin/tournament/[id]/reset-teams/route.ts
Purpose: Delete all built teams for a SOLO tournament while still in draft, allowing rebuild.
Preconditions: admin required; tournament not canceled; tournament status must be `draft`; tournament mode must be `SOLO`.
Algorithm:
1. Fetch all team ids for the tournament.
2. Delete `team_members` where team_id IN (teamIds) first (FK-safe order).
3. Delete all `teams` for the tournament.
Outcome: Returns tournament to вЂњpre-team-buildвЂќ state so `/build-teams` can run again.

### Methods

#### POST

- **Handler signature:** export async function POST( _req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "NOT_ADMIN" }
```

---

## /api/admin/tournament/[id]/solo-players

- **File (from src):** app\api\admin\tournament\[id]\solo-players\route.ts
- **Route:** /api/admin/tournament/[id]/solo-players

### Description

src/app/api/admin/tournament/[id]/solo-players/route.ts
Purpose: Provide admin UI with a deterministic ranked list of SOLO players, enriched with bucket and team placement info.
Algorithm:
1. Require admin.
2. Load all players for tournament with strength + seed fields. If none -> return empty.
3. Deterministic ordering: normalize strength [1..5], sort by strength desc, then FNV-1a hash `(id + tournamentId)` asc, then id asc.
4. Derive rank (1..N) and bucket assignment by index:
1..8 -> bucket 1, 9..16 -> bucket 2, rest -> bucket 3.
5. If teams already exist:
Load teams ordered by created_at; map team_id -> team_index (1..8).
Load team_members for those teams; map player_id -> team_index and team_slot.
6. Return players array with: id, full_name, strength, seed fields, rank, bucket, and optional team_index/team_slot (if teams built).
Outcome: A stable, reproducible view that matches the team-building bucket logic and helps admins seed specific players into teams.

### Methods

#### GET

- **Handler signature:** export async function GET( _req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "NOT_ADMIN" }
```

---

## /api/admin/tournament/[id]/solo-players/seed

- **File (from src):** app\api\admin\tournament\[id]\solo-players\seed\route.ts
- **Route:** /api/admin/tournament/[id]/solo-players/seed

### Description

src/app/api/admin/tournament/[id]/solo-players/seed/route.ts
Purpose: Set or clear a SOLO playerвЂ™s manual seed (fixed team placement) before the tournament starts.
Preconditions: admin required; tournament not canceled and not started; tournament registration_mode must be SOLO.
Algorithm:
1. Parse `{ playerId, seed_team_index }`. Allow null/empty to clear seed. Clamp non-null seed_team_index to [1..8].
2. Validate player belongs to tournament.
3. Enforce вЂњmax 8 seeded playersвЂќ rule:
Load current seeded players (`seed_team_index is not null`).
If this player is not already seeded and weвЂ™re trying to set a new seed while seedsCount>=8 -> reject.
4. Update the player row with:
`seed_team_index` (nullable)
`seed_slot` set to 1 when seeded (placeholder validity), else null.
5. Rely on DB unique constraint `(tournament_id, seed_team_index) WHERE seed_team_index IS NOT NULL` to prevent two players occupying same seed team index; surface conflict errors as 400.
Outcome: Controls deterministic вЂњforced placementвЂќ inputs that are consumed by the SOLO team builder.

### Methods

#### POST

- **Handler signature:** export async function POST(req: Request, context: { params: Promise<{ id: string }> })
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "NOT_ADMIN" }
```

---

## /api/admin/tournament/[id]/start

- **File (from src):** app\api\admin\tournament\[id]\start\route.ts
- **Route:** /api/admin/tournament/[id]/start

### Description

src/app/api/admin/tournament/[id]/start/route.ts
Purpose: Start a tournament вЂњmatch stageвЂќ (create the next stage and its 4 games) and update team_state courts.
Preconditions:
Admin required.
Tournament not canceled and not finished.
All accepted registrations must be paid (assertAllAcceptedPaid).
If a previous stage exists, it must be fully completed (every game has winner_team_id) before starting next.
Core mechanics: вЂњ4 courts ladderвЂќ where winners move up and losers move down between stages.
Algorithm:
1. Read tournamentId and validate flags; block if canceled/finished.
2. Load last stage (highest number). If exists:
Load its games; ensure all have winner_team_id. If not complete -> reject (вЂњPrevious match is not completeвЂќ).
3. Compute `nextNumber = lastStage.number + 1` (or 1 if no stage yet).
4. Load exactly 8 teams for the tournament; reject otherwise.
5. Build games for the next stage:
A) If this is NOT the first stage:
Load `team_state` rows for tournament (team_id, current_court).
Group teams by court 1..4; require exactly 2 teams per court.
Create 4 games: for each court, pair the 2 teams currently on that court.
B) If this IS the first stage:
Compute team вЂњstrengthвЂќ map:
TEAM mode: strength comes from linked registration strength (`teams.registration_id -> registrations.strength`).
SOLO mode: sum of players.strength across team_members per team.
Order teams by strength desc, but shuffle within equal-strength groups to avoid deterministic bias.
Pair teams sequentially, placing strongest pair on court 4, next on 3, next on 2, weakest on 1 (initial ladder seeding).
6. Insert a new `stages` row with `number=nextNumber`.
7. Insert 4 `games` rows for that stage (court + team_a_id/team_b_id).
8. Update `team_state` for current courts:
If first stage: insert state rows for all 8 teams.
Else: update each teamвЂ™s `current_court` to the newly scheduled court.
9. Update tournament status to `"live"`.
10. Return `{ ok:true, stageNumber: nextNumber }`.
Outcome: Creates the next playable match stage and drives the ladder progression using `team_state` across successive stages.

### Methods

#### POST

- **Handler signature:** export async function POST(req: Request, context: { params: Promise<{ id: string }> })
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "NOT_ADMIN" }
```

---

## /api/admin/tournament/[id]/state

- **File (from src):** app\api\admin\tournament\[id]\state\route.ts
- **Route:** /api/admin/tournament/[id]/state

### Description

src/app/api/admin/tournament/[id]/state/route.ts
Purpose: Admin вЂњcurrent state snapshotвЂќ for ops/dashboard.
Algorithm:
1. Require admin.
2. Load full tournament row (`tournaments.*`).
3. Load teams (id, name, points) ordered by points desc (leaderboard).
4. Load stages ordered by number desc and pick latestStage.
5. If latestStage exists, load its games ordered by court, including winner, score_text, points_awarded, is_final.
6. Return `{ tournament, teams, latestStage, games }`.
Outcome: A compact read model for the admin UI showing the current match stage and standings.

### Methods

#### GET

- **Handler signature:** export async function GET( _req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "NOT_ADMIN" }
```

---

## /api/admin/tournament/[id]/withdraw

- **File (from src):** app\api\admin\tournament\[id]\withdraw\route.ts
- **Route:** /api/admin/tournament/[id]/withdraw

### Description

src/app/api/admin/tournament/[id]/withdraw/route.ts
Purpose: Withdraw (cancel) a registration before tournament start using a cancel code, with rollback if already accepted.
Notes: This endpoint does NOT enforce admin auth despite being under `/admin/...`; it behaves like a вЂњself-service cancel with codeвЂќ.
Preconditions: tournament not canceled and not started.
Algorithm:
1. Parse `{ cancel_code }` and validate it exists.
2. Find the registration by `(tournament_id, cancel_code)`. If not found -> 404.
3. If already withdrawn -> `{ ok:true }`.
4. If registration status is `accepted`, perform rollbackAccepted(registrationId):
Find teams linked to registration (`teams.registration_id`) and delete `team_members` then `teams`.
Delete players linked to registration (`players.registration_id`).
5. Update `registrations.status` -> `"withdrawn"`.
Outcome: Ensures late cancellation cleans up any derived entities created during acceptance, keeping DB consistent.

### Methods

#### POST

- **Handler signature:** export async function POST( req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Body fields:** cancel_code
- **Response (snippet):**

```ts
{ ok: false, error: "Tournament canceled" }
```

---

## /api/admin/tournaments

- **File (from src):** app\api\admin\tournaments\route.ts
- **Route:** /api/admin/tournaments

### Description

src/app/api/admin/tournaments/route.ts
Purpose: Admin CRUD-lite for tournaments (list + create), including optional insertion of points overrides.
GET algorithm:
1. Require admin.
2. Select tournament list fields and order by date desc.
3. Return `{ ok:true, tournaments:[...] }`.
POST algorithm (create tournament):
4. Require admin.
5. Parse tournament fields: name/date/start_time/registration_mode and optional base points (points_c1..c4 with defaults).
6. Insert tournament with status `"draft"` and return created id.
7. Optional overrides: if body contains `overrides[]`, normalize numeric rows (stage_number>=1, finite points) and insert them into `tournament_points_overrides` linked to the new tournament id.
Outcome: Creates a tournament ready for registration/ops flows, with configurable scoring rules per court and per stage.

### Methods

#### GET

- **Handler signature:** export async function GET()
- **Query params:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "NOT_ADMIN" }
```

#### POST

- **Handler signature:** export async function POST(req: Request)
- **Query params:** _not detected_
- **Body fields:** date, name, points_c1, points_c2, points_c3, points_c4, registration_mode, start_time
- **Response (snippet):**

```ts
{ ok: false, error: "NOT_ADMIN" }
```

---

## /api/tournament/[id]/apply

- **File (from src):** app\api\tournament\[id]\apply\route.ts
- **Route:** /api/tournament/[id]/apply

### Description

src/app/api/tournament/[id]/apply/route.ts
Purpose: Public registration endpoint (mode-aware) returning a confirmation code used later for self-withdrawal.
Preconditions: tournament not canceled and not started.
Algorithm:
1. Load tournament flags; block if canceled/started.
2. Load tournament `registration_mode` from DB.
3. Generate a random `confirmation_code` (10 chars).
4. SOLO: validate last/first name + phone starts with '+'. Build `solo_player = "Last First"`. Insert pending registration with phone and default strength=3.
5. TEAM: validate 3 names + phone starts with '+'. Insert pending registration with team_player1..3 and phone.
6. Return `{ ok:true, registration_id, confirmation_code }`.
Outcome: Creates a pending registration request that must later be accepted by admin; confirmation_code enables participant self-withdrawal.

### Methods

#### POST

- **Handler signature:** export async function POST(req: Request, context: { params: Promise<{ id: string }> })
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "Tournament canceled" }
```

---

## /api/tournament/[id]/mode

- **File (from src):** app\api\tournament\[id]\mode\route.ts
- **Route:** /api/tournament/[id]/mode

### Description

src/app/api/tournament/[id]/mode/route.ts
Purpose: Public read-only helper returning tournament registration_mode.
Algorithm: Query `tournaments.registration_mode` by id; return `{ ok:true, registration_mode }` or 404.
Outcome: Allows the public UI to render the correct registration form (SOLO vs TEAM).

### Methods

#### GET

- **Handler signature:** export async function GET( _req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "Not found" }
```

---

## /api/tournament/[id]/public

- **File (from src):** app\api\tournament\[id]\public\route.ts
- **Route:** /api/tournament/[id]/public

### Description

src/app/api/tournament/[id]/public/route.ts
Purpose: Public вЂњtournament showcaseвЂќ endpoint: standings + latest match + UI hint for transitions.
Algorithm:
1. Load tournament public fields (including points configuration and status).
2. Load teams ordered by points desc (leaderboard).
3. Load stages ordered by number desc and pick latestStage.
4. If latestStage exists, load its games ordered by court (winner, score_text, points_awarded, is_final).
5. Compute `nextStageExists` as a UI signal:
If latestStage number is N, check whether stage N+1 already exists in DB.
This is used to hide/show arrows/transitions on the public board until the next match is actually created.
6. Return `{ tournament, teams, latestStage, games, nextStageExists }`.
Outcome: Read model for the public screen that supports both вЂњcurrent matchвЂќ display and controlled progression visuals.

### Methods

#### GET

- **Handler signature:** export async function GET( _req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "Not found" }
```

---

## /api/tournament/[id]/withdraw

- **File (from src):** app\api\tournament\[id]\withdraw\route.ts
- **Route:** /api/tournament/[id]/withdraw

### Description

src/app/api/tournament/[id]/withdraw/route.ts
Purpose: Participant self-withdrawal by confirmation code before tournament start, with rollback if accepted.
Preconditions: tournament not canceled and not started.
Algorithm:
1. Parse `{ confirmation_code }`; validate present.
2. Find registration by `(tournament_id, confirmation_code)`. If not found -> 404.
3. If already withdrawn -> `{ ok:true }`.
4. If status is `accepted`, rollbackAccepted(registrationId):
Delete team_members and teams linked to registration (TEAM flow).
Delete players linked to registration (both TEAM and SOLO).
5. Update `registrations.status` -> `"withdrawn"`.
Outcome: Ensures self-service withdrawals remain consistent even if admin already accepted the registration (removes derived entities).

### Methods

#### POST

- **Handler signature:** export async function POST( req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Body fields:** confirmation_code
- **Response (snippet):**

```ts
{ ok: false, error: "Tournament canceled" }
```

---

## /api/tournaments

- **File (from src):** app\api\tournaments\route.ts
- **Route:** /api/tournaments

### Description

src/app/api/tournaments/route.ts
Purpose: Public tournaments list endpoint.
Algorithm: Select tournaments list fields from DB ordered by date desc; return `{ ok:true, tournaments:[...] }` or 400 on DB error.
Outcome: Minimal data source for public вЂњchoose tournament / upcoming eventsвЂќ view.

### Methods

#### GET

- **Handler signature:** export async function GET()
- **Query params:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error }
```


