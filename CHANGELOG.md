# Changelog — Lavash MVP

This file records key decisions and code changes so context can be restored in a new chat.

## 2026-02-xx — Initial MVP setup
- Next.js App Router + TS + Tailwind
- Supabase DB integration via service role in API routes
- Admin auth simplified to cookie admin=1

## Tournament logic decisions
- Court 1 is strongest; court 4 weakest
- Winner moves up (court-1), loser moves down (court+1), clamped [1..4]
- “Match” equals “round” for all 4 courts simultaneously
- New match starts ONLY via judge pressing Start
- Tournament finishes ONLY via judge pressing Finish
- Removed “final per court” checkbox concept

## Key bug fixes / refactors
- Fixed Next.js dynamic params in API routes using `context: { params: Promise<{id:string}> }`
- Removed deprecated middleware patterns / updated cookie access where needed
- Fixed start endpoint to:
  - compute stage.number = last + 1
  - block start if previous stage not complete
  - for stage2+ pair by team_state.current_court
  - update team_state by update on subsequent stages
- Fixed result endpoint to:
  - save winner, score, points_awarded
  - increment team points
  - update team_state movement
  - DO NOT auto-create next stage (removed auto-start)
- UI improvements:
  - Winner selection: two buttons with VS (no dropdown)
  - Save disabled until winner selected
  - Court header shows points for that court
  - On save, show “Результат сохранён” badge inside court card
  - After finish, hide “Current match” section and show “Tournament results” section
  - Admin registrations: hide add form when tournament canceled/finished (recommended: only draft)

## Registration changes
- Public apply UX:
  - homepage shows tournaments sorted by date desc with status
  - apply button visible for status=draft only
  - SOLO form split into last_name/first_name + phone (phone starts with +)
  - Team form includes phone of applicant
  - After submit show confirmation_code (not a link)

## Pending tasks / TODO
- Public showcase page (t/[id]) for everyone:
  - show teams, match schedule, results, ranking
- Admin registration management:
  - accept/reject/unaccept/withdraw rules before start
  - judge sets SOLO strength 1..5 (default 3 on submit)
- Build teams (SOLO):
  - judge can set strength then randomize by buckets
- Better admin auth (Supabase Auth + RLS)
- Deployment instructions (Vercel / Supabase env vars)