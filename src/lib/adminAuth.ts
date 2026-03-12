// src/lib/adminAuth.ts
/*
Purpose:
Server-side admin authentication and authorization helpers.

Responsibilities:
1. Read current admin session token from cookies.
2. Resolve active session from `admin_sessions`.
3. Validate that session:
   - exists
   - is not closed
   - is not expired
4. Load linked `admin_users` row.
5. Reject inactive or missing users.
6. Enforce role checks where needed.
7. Update sliding session activity / expiry according to auth settings.

Typical helpers in this file:
- getCurrentAdminUser()
- requireAdminOr401()
- requireRoleOr403()
- requireTournamentAccess()

Expected behavior:
- unauthenticated requests return 401
- authenticated but forbidden requests return 403
- successful resolution returns current user/session context

Design intent:
Centralize all admin-session checks in one place so route handlers stay small,
consistent, and secure.

Outcome:
Provides the canonical backend guard layer for all admin API routes.
*/

import { requireAnyAdminUserOr401, requirePlatformAdminOr401 } from "@/lib/adminAccess";

export async function requireAdminOr401() {
  return !!(await requireAnyAdminUserOr401());
}

export async function requirePlatformAdminBool() {
  return !!(await requirePlatformAdminOr401());
}
