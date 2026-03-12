# API Contract (generated)

Generated: 2026-03-12 19:01:21

---

## /api/admin/auth/change-password

- **File (from src):** app\api\admin\auth\change-password\route.ts
- **Route:** /api/admin/auth/change-password

### Description

src/app/api/admin/auth/change-password/route.ts
Purpose:
Change the password of the currently authenticated admin user.
Algorithm:
1. Resolve current session and current user.
2. Parse JSON body:
- `currentPassword`
- `newPassword`
- `confirmPassword`
3. Verify:
- current password is correct
- new password differs from current password
- new password and confirmation match
- new password satisfies `admin_auth_settings`
4. Hash the new password.
5. Update `admin_users`:
- `password_hash`
- `must_change_password=false`
- `password_changed_at=now()`
- `password_expires_at=now()+password_max_age_days` (if configured)
6. Write a password-change event into `admin_auth_log`.
7. Return `{ ok:true }`.
Outcome:
Replaces the user password, clears forced-change state, and renews password expiry metadata.

### Methods

#### POST

- **Handler signature:** export async function POST(req: Request)
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response:** _not detected_

---

## /api/admin/auth/login

- **File (from src):** app\api\admin\auth\login\route.ts
- **Route:** /api/admin/auth/login

### Description

src/app/api/admin/auth/login/route.ts
Purpose:
Authenticate an admin user and create a session with brute-force protection.
Algorithm:
1. Parse JSON body:
- login
- password
2. Normalize login:
- trim
- convert to lowercase.
3. Load authentication settings:
- max_failed_login_attempts
- login_lockout_seconds
- session_idle_timeout_minutes
- password policy settings.
4. Check lockout table (`admin_login_lockouts`):
- if login is currently locked (`locked_until > now`)
-> return error.
5. Load user from `admin_users` by normalized login.
6. Validate credentials:
- user exists
- user is active
- password hash matches.
7. If credentials invalid:
- increment `failed_count`
- if failed_count >= max_failed_login_attempts:
set `locked_until`
reset failed_count
- log auth event:
LOGIN_FAILED or LOGIN_LOCKED
- return 401.
8. If credentials valid:
- clear lockout record for login
- determine if password is expired
- generate:
session_token
csrf_token
9. Create row in `admin_sessions`:
- user_id
- session_token
- expires_at
- last_activity_at
- ip
- user_agent
10. Write auth log:
LOGIN_SUCCESS or LOGIN_PASSWORD_EXPIRED.
11. Set cookies:
- admin_session (httpOnly)
- admin_csrf (client-readable)
12. Return user info and password state flags.
Outcome:
Creates a new authenticated admin session while protecting against
password brute-force attacks and enabling CSRF protection for
subsequent API calls.

### Methods

#### POST

- **Handler signature:** export async function POST(req: Request)
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "Bad credentials" }
```

---

## /api/admin/auth/logout

- **File (from src):** app\api\admin\auth\logout\route.ts
- **Route:** /api/admin/auth/logout

### Description

src/app/api/admin/auth/logout/route.ts
Purpose:
Terminate the current admin session.
Algorithm:
1. Read `admin_session` cookie to obtain the session token.
2. If token exists:
- load session from `admin_sessions`
- if session is still open:
set `closed_at = now()`
3. Write auth log event:
- LOGOUT
4. Clear cookies:
- admin_session
- admin_csrf
5. Return `{ ok:true }`.
Outcome:
Invalidates the active session both in browser and database so further
admin requests require re-authentication.

### Methods

#### POST

- **Handler signature:** export async function POST(req: Request)
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: true }
```

---

## /api/admin/auth/me

- **File (from src):** app\api\admin\auth\me\route.ts
- **Route:** /api/admin/auth/me

### Description

src/app/api/admin/auth/me/route.ts
Purpose:
Resolve the currently authenticated admin user and session state for layout guards,
role-based navigation, and forced password change redirects.
Algorithm:
1. Read the admin session cookie / token.
2. Look up the session in `admin_sessions`.
3. Validate that the session:
- exists
- is not closed
- is not expired
4. Load the linked `admin_users` row.
5. Reject if the user is missing or inactive.
6. Update `last_activity_at` and, if needed, slide `expires_at`
according to `session_idle_timeout_minutes` from `admin_auth_settings`.
7. Compute:
- `must_change_password`
- `password_expired`
- user roles and display fields
8. Return:
`{ user, must_change_password, password_expired }`.
Outcome:
Provides the canonical authenticated admin context used by the admin layout,
page guards, and UI visibility rules.

### Methods

#### GET

- **Handler signature:** export async function GET()
- **Query params:** _not detected_
- **Response:** _not detected_

---

## /api/admin/auth-log

- **File (from src):** app\api\admin\auth-log\route.ts
- **Route:** /api/admin/auth-log

### Description

src/app/api/admin/auth-log/route.ts
Purpose:
Read the immutable admin authentication log for audit and troubleshooting.
Algorithm:
1. Require role `ADMIN`.
2. Parse optional filters/pagination from query params:
- date range
- login
- success/failure
- event_type
- page / limit
3. Query `admin_auth_log` ordered by newest first.
4. Return rows formatted for the admin log screen.
Optional maintenance behavior:
- old rows may be cleaned by a scheduled process using
`admin_auth_settings.auth_log_retention_days`,
but this endpoint itself is read-only.
Outcome:
Supplies the "Auth log" page with successful/failed logins, logouts,
password changes, resets, and related audit metadata.

### Methods

#### GET

- **Handler signature:** export async function GET()
- **Query params:** _not detected_
- **Response:** _not detected_

---

## /api/admin/auth-settings

- **File (from src):** app\api\admin\auth-settings\route.ts
- **Route:** /api/admin/auth-settings

### Description

src/app/api/admin/auth-settings/route.ts
Purpose:
Read and update global authentication / admin-security settings.
GET algorithm:
1. Require role `ADMIN`.
2. Load the singleton row from `admin_auth_settings`.
3. If it does not exist yet, create or return defaults.
4. Return settings to the UI.
POST algorithm:
1. Require role `ADMIN`.
2. Parse JSON body:
- min_password_length
- require_complexity
- password_max_age_days
- session_idle_timeout_minutes
- auth_log_retention_days
- tournament_archive_days
3. Validate configured values against DB/business constraints.
4. Upsert the singleton settings row.
5. Set `updated_at=now()` and `updated_by=current admin`.
6. Return `{ ok:true, settings }`.
The endpoint also controls brute-force protection parameters:
- max_failed_login_attempts
Maximum number of consecutive failed logins before temporary lockout.
- login_lockout_seconds
Duration of temporary login lock after exceeding the failure threshold.
Outcome:
Provides the configuration backend for password policy, session timeout,
auth-log retention, and tournament auto-archive threshold.

### Methods

#### GET

- **Handler signature:** export async function GET()
- **Query params:** _not detected_
- **Response:** _not detected_

#### POST

- **Handler signature:** export async function POST(req: Request)
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response:** _not detected_

---

## /api/admin/bootstrap

- **File (from src):** app\api\admin\bootstrap\route.ts
- **Route:** /api/admin/bootstrap

### Description

_No top-of-file comment block found._

### Methods

#### POST

- **Handler signature:** export async function POST(req: Request)
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "BAD_BOOTSTRAP_TOKEN" }
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

## /api/admin/tournament/[id]/archive

- **File (from src):** app\api\admin\tournament\[id]\archive\route.ts
- **Route:** /api/admin/tournament/[id]/archive

### Description

src/app/api/admin/tournament/[id]/archive/route.ts
Purpose:
Manually archive a completed or canceled tournament.
Algorithm:
1. Require role `ADMIN`.
2. Read `tournamentId` from route params.
3. Load tournament record from DB.
4. Validate:
- tournament exists
- tournament is not already archived
- tournament status is either `finished` or `canceled`
5. If validation passes:
- set `archived_at = now()`
- set `archived_by_user_id = ctx.user.id`
6. Persist update to `tournaments`.
7. Return `{ ok:true }`.
Outcome:
Moves the tournament into the archive set so it no longer appears in
the active tournament list while preserving full historical data.

### Methods

#### POST

- **Handler signature:** export async function POST(_req: Request, context: { params: Promise<{ id: string }> })
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "РўСѓСЂРЅРёСЂ РЅРµ РЅР°Р№РґРµРЅ." }
```

---

## /api/admin/tournament/[id]/build-teams

- **File (from src):** app\api\admin\tournament\[id]\build-teams\route.ts
- **Route:** /api/admin/tournament/[id]/build-teams

### Description

src/app/api/admin/tournament/[id]/build-teams/route.ts
Purpose:
Build SOLO teams from accepted and fully paid players using deterministic buckets plus one-time randomness.
Algorithm:
1. Require authorized tournament manager access.
2. Load tournament and reject unless:
- mode == SOLO
- status == draft
- tournament not canceled
- tournament not finished
3. Enforce payment guard:
- call `assertAllAcceptedPaid(tournamentId)`
4. Load accepted SOLO registrations / players.
5. Require the expected roster size for SOLO main draw (24 players) according to business rules.
6. Sort players deterministically:
- strength DESC
- stable hash(player.id + tournamentId)
- id ASC
7. Split sorted players into buckets A/B/C by position.
8. Apply one-time shuffle inside each bucket.
9. Respect manual seed assignments where configured.
10. Create 8 `teams`.
11. Create `team_members` rows with slots 1..3.
12. Initialize `team_state` for each team.
13. Return `{ ok:true, teamsBuilt }`.
Outcome:
Creates the playable SOLO team structure used by all later match operations.

### Methods

#### POST

- **Handler signature:** export async function POST( _req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "Tournament canceled" }
```

---

## /api/admin/tournament/[id]/cancel

- **File (from src):** app\api\admin\tournament\[id]\cancel\route.ts
- **Route:** /api/admin/tournament/[id]/cancel

### Description

src/app/api/admin/tournament/[id]/cancel/route.ts
Purpose:
Cancel a tournament irreversibly.
Algorithm:
1. Require authorized tournament manager access.
2. Load tournament.
3. Reject if tournament is already canceled or already finished.
4. Update `tournaments.status='canceled'`.
5. Convert all still-relevant registrations into their canceled terminal view/state
if the project applies explicit registration cancellation updates.
6. Prevent any further:
- public applications
- team building
- match starts
- result entry
7. Return `{ ok:true }`.
Outcome:
Moves the tournament into a terminal canceled state and blocks all operational flows.

### Methods

#### POST

- **Handler signature:** export async function POST( _req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "Not found" }
```

---

## /api/admin/tournament/[id]/finish

- **File (from src):** app\api\admin\tournament\[id]\finish\route.ts
- **Route:** /api/admin/tournament/[id]/finish

### Description

src/app/api/admin/tournament/[id]/finish/route.ts
Purpose:
Finish a tournament after the last current stage is fully completed.
Algorithm:
1. Require authorized tournament manager access.
2. Load tournament and latest stage.
3. Reject if:
- tournament is canceled
- tournament is already finished
- no started stage exists when business rules require at least one stage
4. Load games of the latest stage.
5. Require every game in the latest stage to have a winner.
6. Optionally mark latest-stage games with `is_final=true`.
7. Update `tournaments.status='finished'`.
8. Return `{ ok:true }`.
Outcome:
Closes the tournament lifecycle and prevents starting new stages or editing competitive state further.

### Methods

#### POST

- **Handler signature:** export async function POST(_req: Request, context: any)
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "Р СћРЎС“РЎР‚Р Р…Р С‘РЎР‚ Р С•РЎвЂљР СР ВµР Р…Р ВµР Р…" }
```

---

## /api/admin/tournament/[id]/game/result

- **File (from src):** app\api\admin\tournament\[id]\game\result\route.ts
- **Route:** /api/admin/tournament/[id]/game/result

### Description

src/app/api/admin/tournament/[id]/game/result/route.ts
Purpose:
Save the result of one court game in the current stage.
Algorithm:
1. Require authorized tournament operator access.
2. Parse JSON body:
- gameId
- winnerTeamId
- scoreText
3. Load the target game and validate:
- game belongs to this tournament
- winnerTeamId is either team_a_id or team_b_id
- tournament is not canceled
- tournament is not finished
4. Resolve awarded points:
- check stage-specific override for this stage/court
- otherwise use base points from tournament
5. Update `games`:
- `winner_team_id`
- `score_text`
- `points_awarded`
6. Increment winner team points.
7. Update `team_state.current_court`:
- winner moves up one court (min 1)
- loser moves down one court (max 4)
8. Return `{ ok:true }`.
Outcome:
Persists one court result, updates scoring, and repositions teams for the next stage pairing logic.

### Methods

#### POST

- **Handler signature:** export async function POST(req: Request, context: { params: Promise<{ id: string }> })
- **Query params:** _not detected_
- **Body fields:** gameId, scoreText, winnerTeamId
- **Response (snippet):**

```ts
{ ok: false, error: "Tournament canceled" }
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
Purpose:
Update strength of an already materialized player row (typically SOLO flow before match 1).
Algorithm:
1. Require authorized tournament manager access.
2. Reject if:
- tournament canceled
- tournament finished
- teams are already built and current business rules lock strength changes
- tournament already moved past the editable pre-start state
3. Parse JSON body:
- playerId
- strength
4. Validate:
- player belongs to this tournament
- strength is within 1..5
5. Update `players.strength`.
6. Return `{ ok:true }`.
Outcome:
Lets the judge refine the competitive level of a player before final team composition is frozen.

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

## /api/admin/tournament/[id]/points-overrides

- **File (from src):** app\api\admin\tournament\[id]\points-overrides\route.ts
- **Route:** /api/admin/tournament/[id]/points-overrides

### Description

src/app/api/admin/tournament/[id]/points-overrides/route.ts
Purpose:
Read and replace stage-specific point overrides for a tournament.
GET algorithm:
1. Require authorized tournament manager access.
2. Load all rows from `tournament_points_overrides` for the tournament,
ordered by `stage_number`.
3. Return `{ ok:true, overrides }`.
POST algorithm:
1. Require authorized tournament manager access.
2. Reject if:
- tournament is canceled
- tournament is finished
- first match has already started
3. Parse `overrides[]` from JSON body.
4. Validate each row:
- stage_number >= 1
- no duplicate stage_number values
- points_c1..c4 are present
5. Replace override set atomically:
- delete existing tournament overrides
- insert new rows
6. Return `{ ok:true }`.
Outcome:
Supports pre-start configuration of special per-stage scoring rules.

### Methods

#### GET

- **Handler signature:** export async function GET(_req: Request, context: { params: Promise<{ id: string }> })
- **Query params:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error }
```

#### POST

- **Handler signature:** export async function POST(req: Request, context: { params: Promise<{ id: string }> })
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error }
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
Purpose:
Manually create a new tournament registration from the admin registrations page.
Algorithm:
1. Require tournament manager access.
2. Read tournament mode and status.
3. Reject if registrations are locked:
- tournament canceled
- tournament finished
- tournament already started
4. Parse mode-specific payload:
- SOLO: first name, last name, phone
- TEAM: three player names, phone
5. Generate a confirmation code using the same business rules as public registration.
6. Insert a new `registrations` row in `pending` status.
7. Return `{ ok:true, confirmation_code }`.
Outcome:
Lets the judge add a participant manually and immediately hand over the generated confirmation code.

### Methods

#### POST

- **Handler signature:** export async function POST(req: Request, context: any)
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "Tournament canceled" }
```

---

## /api/admin/tournament/[id]/registrations/payment

- **File (from src):** app\api\admin\tournament\[id]\registrations\payment\route.ts
- **Route:** /api/admin/tournament/[id]/registrations/payment

### Description

src/app/api/admin/tournament/[id]/registrations/payment/route.ts
Purpose:
Toggle payment confirmation for a registration slot.
Algorithm:
1. Require authorized tournament manager access.
2. Reject if registration operations are locked
according to tournament lifecycle rules.
3. Parse JSON body:
- registrationId
- slot
- paid
4. Validate:
- registration belongs to this tournament
- slot is valid for the mode
SOLO usually only slot=1
TEAM allows 1..3
5. Upsert the corresponding `registration_payments` row.
6. If `paid=true`, set `paid_at=now()`.
7. If `paid=false`, clear or replace payment state according to current project convention.
8. Return `{ ok:true }`.
Outcome:
Supports judge-side confirmation of participation payments and feeds the build/start payment guard.

### Methods

#### POST

- **Handler signature:** export async function POST(req: Request, context: { params: Promise<{ id: string }> })
- **Query params:** _not detected_
- **Body fields:** paid, registrationId, slot
- **Response (snippet):**

```ts
{ ok: false, error: "Tournament canceled" }
```

---

## /api/admin/tournament/[id]/registrations

- **File (from src):** app\api\admin\tournament\[id]\registrations\route.ts
- **Route:** /api/admin/tournament/[id]/registrations

### Description

src/app/api/admin/tournament/[id]/registrations/route.ts
Purpose:
Read the full registrations state for a tournament and process registration status actions.
GET algorithm:
1. Require tournament manager/viewer access.
2. Load:
- tournament header fields
- registrations list
- tournament flags
- payment rows
3. Additionally resolve chief judge name for header display.
4. Return a payload for the admin registrations page.
POST algorithm:
unchanged.

### Methods

#### GET

- **Handler signature:** export async function GET( _req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "Tournament not found" }
```

#### POST

- **Handler signature:** export async function POST( req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Body fields:** action, registrationId
- **Response (snippet):**

```ts
{ ok: false, error: "Tournament not found" }
```

---

## /api/admin/tournament/[id]/registrations/strength

- **File (from src):** app\api\admin\tournament\[id]\registrations\strength\route.ts
- **Route:** /api/admin/tournament/[id]/registrations/strength

### Description

src/app/api/admin/tournament/[id]/registrations/strength/route.ts
Purpose:
Update registration-level strength before the registration is transformed into tournament mechanics.
Algorithm:
1. Require authorized tournament manager access.
2. Reject if registrations are locked:
- tournament started
- tournament finished
- tournament canceled
3. Parse JSON body:
- registrationId
- strength
4. Validate:
- registration belongs to this tournament
- strength is within 1..5
5. Update `registrations.strength`.
6. For flows where player rows already exist and must stay in sync,
apply corresponding synchronization if business logic requires it.
7. Return `{ ok:true }`.
Outcome:
Supports judge-driven calibration of participant strength at the application stage.

### Methods

#### POST

- **Handler signature:** export async function POST( req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Body fields:** registrationId, strength
- **Response (snippet):**

```ts
{ ok: false, error: "Tournament canceled" }
```

---

## /api/admin/tournament/[id]/reset-teams

- **File (from src):** app\api\admin\tournament\[id]\reset-teams\route.ts
- **Route:** /api/admin/tournament/[id]/reset-teams

### Description

src/app/api/admin/tournament/[id]/reset-teams/route.ts
Purpose:
Remove previously built SOLO teams so the judge can rebuild them after adjusting strength or seeding.
Algorithm:
1. Require authorized tournament manager access.
2. Load tournament and reject unless:
- mode == SOLO
- status == draft
- tournament not canceled
- tournament not finished
3. Reject if tournament has already started.
4. Delete dependent rows in safe order:
- `team_members`
- `team_state`
- `teams`
5. Keep player rows and registrations intact.
6. Return `{ ok:true }`.
Outcome:
Returns the SOLO setup phase to a pre-build state without losing accepted players or their strength settings.

### Methods

#### POST

- **Handler signature:** export async function POST( _req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "Tournament canceled" }
```

---

## /api/admin/tournament/[id]/settings

- **File (from src):** app\api\admin\tournament\[id]\settings\route.ts
- **Route:** /api/admin/tournament/[id]/settings

### Description

src/app/api/admin/tournament/[id]/settings/route.ts
Purpose:
Read and update tournament-level settings after creation.
GET algorithm:
1. Require user who is allowed to manage this tournament
(`ADMIN` or responsible `CHIEF_JUDGE`).
2. Load tournament core fields:
- name
- date
- start_time
- registration_mode
- status
- chief_judge_user_id
- points_c1..c4
3. Load:
- current judges from `tournament_judges`
- available chief-judge options
- available judge options
- points overrides
- tournament flags (started / canceled / finished)
4. Return a settings payload for the UI.
POST algorithm:
1. Require tournament manager access.
2. Parse JSON body:
- date
- start_time
- chief_judge_user_id
- judge_ids[]
- points_c1..c4
- overrides[]
3. Validate:
- chief judge is mandatory
- only ADMIN may replace chief judge
- date cannot be moved into the past
- date/time/points/overrides may be changed only before tournament start
4. Update tournament row.
5. Replace `tournament_judges`.
6. Replace `tournament_points_overrides` if still editable.
7. Return `{ ok:true }`.
Outcome:
Backs the tournament settings page for schedule, judges, chief judge, and scoring rules.

### Methods

#### GET

- **Handler signature:** export async function GET(_req: Request, context: { params: Promise<{ id: string }> })
- **Query params:** _not detected_
- **Response:** _not detected_

#### POST

- **Handler signature:** export async function POST(req: Request, context: { params: Promise<{ id: string }> })
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response:** _not detected_

---

## /api/admin/tournament/[id]/solo-players

- **File (from src):** app\api\admin\tournament\[id]\solo-players\route.ts
- **Route:** /api/admin/tournament/[id]/solo-players

### Description

src/app/api/admin/tournament/[id]/solo-players/route.ts
Purpose:
Return the pre-build SOLO player list used for bucket visualization, seeding, and manual review.
Algorithm:
1. Require authorized tournament manager access.
2. Load all eligible SOLO players for this tournament.
3. Build the deterministic ranking order:
- strength DESC
- stable hash(player.id + tournamentId)
- id ASC
4. Derive per-player metadata:
- rank
- bucket (A/B/C or 1/2/3)
- current team assignment if teams already exist
- team_index and team_slot if assigned
- seed_team_index / seed_slot if present
5. Return `{ ok:true, players }`.
Outcome:
Feeds the SOLO pre-build management grid with stable bucket and seeding information.

### Methods

#### GET

- **Handler signature:** export async function GET( _req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: eP }
```

---

## /api/admin/tournament/[id]/solo-players/seed

- **File (from src):** app\api\admin\tournament\[id]\solo-players\seed\route.ts
- **Route:** /api/admin/tournament/[id]/solo-players/seed

### Description

src/app/api/admin/tournament/[id]/solo-players/seed/route.ts
Purpose:
Assign or clear manual seeding for a SOLO player before teams are built.
Algorithm:
1. Require authorized tournament manager access.
2. Reject if:
- tournament canceled
- tournament finished
- first match already started
- teams are already built and seeding is currently locked
3. Parse JSON body:
- playerId
- seed_team_index (1..8 or null)
4. Validate:
- player belongs to this tournament
- seed_team_index is null or within 1..8
- no other player in the same tournament already owns this seed_team_index
5. Update `players.seed_team_index`.
6. Optionally clear or recompute `seed_slot` if that field is part of the current seeding model.
7. Return `{ ok:true }`.
Outcome:
Lets the judge lock selected players into target teams before automatic SOLO team generation.

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

## /api/admin/tournament/[id]/start

- **File (from src):** app\api\admin\tournament\[id]\start\route.ts
- **Route:** /api/admin/tournament/[id]/start

### Description

src/app/api/admin/tournament/[id]/start/route.ts
Purpose:
Start the next tournament match stage by creating a new stage and 4 court games.
Algorithm:
1. Require authorized tournament operator:
- ADMIN
- responsible CHIEF_JUDGE
- or allowed JUDGE according to current permissions model
2. Load tournament and guards:
- reject if canceled
- reject if finished
3. Enforce payment guard:
- call `assertAllAcceptedPaid(tournamentId)`
- reject if any accepted registration is unpaid
4. Load latest stage and its games.
5. If a previous stage exists, require all its games to have a winner.
6. Determine next stage number:
- stage 1 if none exists
- otherwise latestStage.number + 1
7. Before starting stage 1:
- move all `reserve_pending` registrations back to `reserve`
8. Create a new `stages` row.
9. Determine pairings:
- stage 1:
use initial tournament pairing logic
for SOLO, this depends on teams built from accepted/paid players
optional seeding and strength ordering may affect the first distribution
- stage 2+:
group teams by `team_state.current_court`
create one game per court from the two teams currently assigned there
10. Resolve points per court:
- use `tournament_points_overrides` for this stage if present
- otherwise use base `tournaments.points_c1..c4`
11. Create 4 `games` rows (courts 1..4).
12. Set `tournament.status='live'` if it was still `draft`.
13. Return `{ ok:true, stageNumber, createdGames }` or equivalent payload.
Outcome:
Advances the tournament into the next playable match stage and populates the court grid.

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

## /api/admin/tournament/[id]/state

- **File (from src):** app\api\admin\tournament\[id]\state\route.ts
- **Route:** /api/admin/tournament/[id]/state

### Description

src/app/api/admin/tournament/[id]/state/route.ts
Purpose:
Return the operational tournament state for the match-management page.
Algorithm:
1. Require authorized admin / judge access for this tournament.
2. Load:
- tournament row
- chief judge display name
- teams
- latest stage
- games of the latest stage
3. Return derived state used by the ops UI.
Outcome:
Supplies the ops page with the canonical current-match and ladder state.

### Methods

#### GET

- **Handler signature:** export async function GET( _req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: e1 }
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
Purpose:
List active tournaments for the admin homepage and create new tournaments.
GET algorithm:
1. Require authenticated admin session.
2. Determine visible tournaments by role:
- ADMIN: all non-archived tournaments
- CHIEF_JUDGE: tournaments where user is chief judge
- JUDGE: tournaments where user is assigned via `tournament_judges`
3. Exclude archived tournaments from the active list.
4. Return tournament cards with fields needed by UI:
- id
- name
- date
- start_time
- registration_mode
- status
- chief_judge_user_id
- chief_judge_name
POST algorithm:
1. Require allowed creator role (`ADMIN` or `CHIEF_JUDGE` according to current business rules).
2. Parse JSON body:
- name
- date
- start_time
- registration_mode
- points_c1..c4
- chief_judge_user_id
- judge_ids (optional)
- overrides (optional)
3. Validate:
- chief judge is mandatory
- selected chief judge is active and has role `CHIEF_JUDGE`
- if current user is CHIEF_JUDGE, chief judge is fixed to self
4. Insert tournament in status `draft`.
5. Insert optional `tournament_judges`.
6. Insert optional `tournament_points_overrides`.
7. Return `{ ok:true, tournament }`.
Outcome:
Drives the main admin tournament list and tournament creation workflow.

### Methods

#### GET

- **Handler signature:** export async function GET(req: Request)
- **Query params:** archived
- **Response:** _not detected_

#### POST

- **Handler signature:** export async function POST(req: Request)
- **Query params:** archived
- **Body fields:** _not detected_
- **Response:** _not detected_

---

## /api/admin/users/[id]/reset-password

- **File (from src):** app\api\admin\users\[id]\reset-password\route.ts
- **Route:** /api/admin/users/[id]/reset-password

### Description

src/app/api/admin/users/[id]/reset-password/route.ts
Purpose:
Administrative password reset for another admin user.
Algorithm:
1. Require role `ADMIN`.
2. Read target `userId` from route params.
3. Parse JSON body with the new temporary password.
4. Validate new password against current auth settings.
5. Hash the password.
6. Update target `admin_users` row:
- replace `password_hash`
- set `must_change_password=true`
- set new `password_expires_at` if password lifetime is configured
- update `updated_by`
7. Optionally close active sessions of that user so the new password takes effect immediately.
8. Write an auth-log / audit event describing admin-initiated password reset.
9. Return `{ ok:true }`.
Outcome:
Lets an administrator issue a new temporary password and force the target user
to set a permanent password on next login.

### Methods

#### POST

- **Handler signature:** export async function POST(req: Request, context: { params: Promise<{ id: string }> })
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response:** _not detected_

---

## /api/admin/users/[id]

- **File (from src):** app\api\admin\users\[id]\route.ts
- **Route:** /api/admin/users/[id]

### Description

src/app/api/admin/users/[id]/route.ts
Purpose:
Update an existing admin user without deleting them.
Algorithm:
1. Require role `ADMIN`.
2. Read target `userId` from route params.
3. Parse editable fields from JSON body:
- first_name
- last_name
- login
- roles[]
- is_active
4. Validate:
- target user exists
- roles are from the allowed set
- login remains unique among other users
5. Special handling:
- if reactivating a previously blocked user, require a new temporary password
- on unblock:
hash new password
set `must_change_password=true`
renew password lifecycle dates
6. Update `admin_users` and `updated_by`.
7. Return `{ ok:true }`.
Outcome:
Supports blocking/unblocking users and changing their role assignment while preserving audit history.

### Methods

_No exported GET/POST handlers found._

---

## /api/admin/users

- **File (from src):** app\api\admin\users\route.ts
- **Route:** /api/admin/users

### Description

src/app/api/admin/users/route.ts
Purpose:
Admin-user directory endpoint: list existing admin users and create new ones.
GET algorithm:
1. Require authenticated admin with role `ADMIN`.
2. Load all admin users ordered for convenient UI display.
3. Extract distinct `created_by` ids from the loaded rows.
4. Load creator users in a second query.
5. Attach lightweight `created_by_user` object to every row.
6. Return fields needed by the admin users page.
POST algorithm:
1. Require role `ADMIN`.
2. Parse JSON body:
- first_name
- last_name
- login
- password
- roles[]
- is_active (optional; defaults to true)
3. Validate:
- login uniqueness
- allowed roles only
- initial password against auth settings
4. Hash the password.
5. Insert a new row into `admin_users` with:
- `must_change_password=true`
- `created_by=current admin`
- `updated_by=current admin`
6. Optionally calculate initial `password_expires_at`.
7. Write audit/auth-log event.
8. Return `{ ok:true, id }`.
Outcome:
Supports the admin-users screen for both listing and creating admin-panel accounts.

### Methods

#### GET

- **Handler signature:** export async function GET()
- **Query params:** _not detected_
- **Response:** _not detected_

#### POST

- **Handler signature:** export async function POST(req: Request)
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response:** _not detected_

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
Purpose:
Build the full public showcase payload for one tournament.
Algorithm:
1. Read `tournamentId` from params.
2. Load tournament core metadata:
- name
- date
- start_time
- registration_mode
- status
- chief_judge_name
- base points
3. Load current teams and current/latest stage games.
4. Load public-facing registrations when relevant.
5. Build public display state:
- before teams exist / before first match in some modes -> show registrations
- after teams exist or tournament is already in progress -> show team rating
6. Ensure reserve registrations are shown only in the intended pre-start scenarios,
with reserve rows grouped at the bottom.
7. Return:
- tournament
- teams
- games
- registrations
- latestStage
- helper flags like `nextStageExists` if used by UI
Outcome:
Provides the single public tournament page with all data needed for
header, registrations/rating block, and current match courts.

### Methods

#### GET

- **Handler signature:** export async function GET( _req: Request, context: { params: Promise<{ id: string }> } )
- **Query params:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "Not found" }
```

---

## /api/tournament/[id]/reserve-confirm

- **File (from src):** app\api\tournament\[id]\reserve-confirm\route.ts
- **Route:** /api/tournament/[id]/reserve-confirm

### Description

src/app/api/tournament/[id]/reserve-confirm/route.ts
Purpose:
Public API endpoint that allows a player/team from the reserve list to confirm
their transition into the main tournament roster when a slot becomes available.
This endpoint verifies the applicant's identity using the confirmation code,
phone number, and an additional identifying field (last name for SOLO mode or
any player's name for TEAM mode). If the registration is valid, the endpoint
attempts to promote the registration from reserve to the main roster.
Algorithm:
1. Parse request body and read:
- `confirmation_code`
- `phone`
- `solo_last_name` (for SOLO mode)
- `any_player_name` (for TEAM mode)
2. Validate that `confirmation_code` and `phone` are provided.
If missing в†’ return 400.
3. Attempt a fast lookup in the `registrations` table using:
- `tournament_id`
- exact `confirmation_code`
4. If the fast lookup fails, perform a fallback search:
- load registrations for the tournament in statuses:
`reserve_pending`, `reserve`, `accepted`
- filter them in memory using:
вЂў confirmation code (case-insensitive)
вЂў exact phone match
вЂў name verification (depending on mode)
5. Validate candidate registration:
- confirmation code matches (case-insensitive)
- phone matches exactly
- registration status is eligible
- identity verification passes:
вЂў SOLO: last name matches
вЂў TEAM: provided name matches any of the three players
6. If no valid registration is found в†’ return 404 with a generic
"registration not found" message.
7. Call `confirmReservePromotion(tournamentId, registrationId)` which:
- checks whether a slot in the main roster is still available
- promotes the registration if possible
- otherwise leaves it in reserve.
8. Return result:
- `{ ok: true, promoted: true }` if promotion succeeded
- `{ ok: true, promoted: false }` if the slot was already taken.
Outcome:
Provides a safe and user-friendly confirmation flow for reserve applicants,
allowing case-insensitive confirmation codes and preventing unauthorized
promotion through multi-field identity verification.

### Methods

#### POST

- **Handler signature:** export async function POST(req: Request, context: { params: Promise<{ id: string }> })
- **Query params:** _not detected_
- **Body fields:** _not detected_
- **Response (snippet):**

```ts
{ ok: false, error: "Bad request" }
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
Purpose:
Return the public list of active tournaments for the site homepage.
Algorithm:
1. Load tournaments intended for public display.
2. Exclude archived tournaments from the active homepage list.
3. Return fields needed by public cards:
- id
- name
- date
- start_time
- registration_mode
- status
- chief_judge_name
4. Sort by nearest / most relevant tournament order used by the UI.
Outcome:
Supplies the public home page with non-archived tournaments and their display metadata.

### Methods

#### GET

- **Handler signature:** export async function GET(req: Request)
- **Query params:** archived
- **Response (snippet):**

```ts
{ ok: false, error }
```


