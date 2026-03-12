// src/app/api/admin/auth/me/route.ts
/*
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
*/

import { requireAnyAdminUserOr401, runAdminHousekeeping, getTournamentAccess } from "@/lib/adminAccess";
import { sessionJson, unauthorized } from "@/lib/adminApi";

export async function GET() {
  await runAdminHousekeeping();
  const ctx = await requireAnyAdminUserOr401();
  if (!ctx) return unauthorized();

  return sessionJson(ctx, {
    ok: true,
    allowPasswordChange: true,
    user: ctx.user,
    settings: {
      session_idle_timeout_minutes: ctx.settings.session_idle_timeout_minutes,
      password_max_age_days: ctx.settings.password_max_age_days,
    },
    must_change_password: ctx.user.must_change_password,
    password_expired: ctx.passwordExpired,
  });
}
