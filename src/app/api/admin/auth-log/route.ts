// src/app/api/admin/auth-log/route.ts
/*
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
*/

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePlatformAdminOr401 } from "@/lib/adminAccess";
import { sessionJson, unauthorized } from "@/lib/adminApi";

export async function GET() {
  const ctx = await requirePlatformAdminOr401();
  if (!ctx) return unauthorized("NOT_ADMIN");

  const { data } = await supabaseAdmin
    .from("admin_auth_log")
    .select("id, created_at, login, event_type, success, message, ip, user_agent")
    .order("created_at", { ascending: false })
    .limit(500);

  return sessionJson(ctx, { ok: true, items: data ?? [] });
}
