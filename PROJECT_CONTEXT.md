# Lavash — PROJECT_CONTEXT.md

## 1. System Overview

Lavash is a lightweight web platform for managing amateur tennis tournaments.

Tech stack:

* Next.js (App Router)
* TypeScript
* Supabase (Postgres)
* TailwindCSS
* Vercel deployment

Architecture principle:

Public UI → API Routes → Tournament Logic → Database

The application has two main surfaces:

1. Public tournament pages
2. Admin panel for judges and administrators

The system prioritizes:

* deterministic tournament mechanics
* simple judge UX during matches
* safe public interactions
* minimal duplicated state

---

# 2. High-Level Architecture

Public Browser
↓
Next.js Pages (React UI)
↓
API Routes
↓
Tournament Logic Layer
↓
Supabase Database

Public pages are read-only except application endpoints.

Admin pages mutate data through API routes using the Supabase service role.

---

# 3. Public Area

Public pages live under:

/t/[id]

Main page structure:

Section 1 — Tournament header
Section 2 — Registrations or Team rating
Section 3 — Current match courts

### Tournament states

draft
live
finished
canceled

Behavior:

draft → registrations open
live → matches visible
finished → results only
canceled → read-only

---

# 4. Registration Flow

Public registration:

GET /t/[id]

User opens application form:

POST /api/tournament/[id]/apply

Validation:

* tournament must not be canceled
* tournament.status == draft

Result:

Registration inserted into `registrations`.

API returns:

confirmation_code

User sees confirmation code for future operations.

---

# 5. Reserve System

Tournament capacity:

SOLO mode = 24 players
TEAM mode = 8 teams

If capacity exceeded:

registration.status = reserve

States:

pending → accepted → reserve → reserve_pending

reserve_pending means:

Player is invited to join main roster because a slot opened.

Confirmation endpoint:

POST /api/tournament/[id]/reserve-confirm

Promotion rules:

If slot still free → accepted
If slot already taken → reserve again

After tournament start:

reserve promotion is disabled.

---

# 6. Admin Panel

Admin interface lives under:

/admin

Authentication uses login + password.

Endpoints:

POST /api/admin/login
POST /api/admin/logout
GET /api/admin/auth/me

Session:

* httpOnly cookie
* SameSite=Lax
* periodic session refresh (60 seconds)

Response of `/api/admin/auth/me`:

{
user: {
id,
first_name,
last_name,
login,
roles[]
},
must_change_password,
password_expired
}

Redirect rules:

invalid session → /admin
expired password → /admin/change-password

---

# 7. Role-Based Access (RBAC)

Roles stored in:

admin_users.roles

### ADMIN

Full system access:

* manage users
* manage auth settings
* view auth logs
* manage tournaments

### CHIEF_JUDGE

Tournament management:

* manage registrations
* build teams
* start matches
* finish tournaments

### JUDGE

Operational role:

* enter match results
* manage courts

Authorization enforced in:

* API routes
* UI navigation

---

# 8. Admin UI Structure

Each tournament page uses the same layout.

## Section 1 — Tournament header

Contains:

* tournament name
* date / time
* mode badge
* status badge
* chief judge
* navigation tabs

Tabs:

Заявки
Матчи
Настройки турнира

Global buttons:

← Турниры
Обновить

Registrations page also displays badges:

* На рассмотрении
* В основе
* Резерв
* Сделаны взносы

---

## Section 2 — Page actions

Registrations page:

(no special actions)

Ops page:

Build teams
Reset teams
Start match
Finish tournament
Cancel tournament

---

## Section 3 — Main content

Registrations:

registrations table

Ops:

courts grid

---

## Section 4 — Secondary content

Ops page:

team rating table

---

# 9. Modal Forms

Admin UI uses modal forms instead of collapsible blocks.

Example: manual registration creation.

Modal shows:

* form fields
* confirmation code after creation

Strength hints:

SOLO:

Уровень игрока по умолчанию будет 3

TEAM:

Уровень команды по умолчанию будет 3

---

# 10. Match Mechanics

Each stage contains 4 games.

Courts:

1..4

Game result endpoint:

POST /api/admin/tournament/[id]/game/result

Updates:

winner_team_id
score_text
points_awarded

Court movement:

winner → court −1
loser → court +1

Limits:

court min = 1
court max = 4

Next stage is not created automatically.

---

# 11. Start Mechanics

Start endpoint:

POST /api/admin/tournament/[id]/start

Rules:

Previous stage must be complete.

Creates:

stage
games

Stage 1:

random pairing

Stage 2+:

pairing by team_state.current_court

Effect:

tournament.status = live

Before first stage:

reserve_pending → reserve

---

# 12. Finish Mechanics

Finish endpoint:

POST /api/admin/tournament/[id]/finish

Rules:

Last stage must be complete.

Effects:

games.is_final = true
tournament.status = finished

---

# 13. Guards

Helper:

getTournamentFlags()

Returns:

started
canceled
finished

Registration operations disabled when:

started == true

Build teams and start require:

assertAllAcceptedPaid()

---

# 14. Security Model

Authentication:

cookie session
httpOnly cookie
SameSite=Lax

Authorization:

role checks in API
UI hides forbidden actions

Admin routes always use:

supabaseAdmin

Service role key is never exposed to the client.

---

# 15. Key Frontend Components

Core components:

TournamentHeader
TournamentTabs
Modal
Badge
GameCard
TeamRatingTable

Admin layout:

AdminLayoutClient

Public pages use centered container layout.
