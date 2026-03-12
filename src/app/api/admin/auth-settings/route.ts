// src/app/api/admin/auth-settings/route.ts
/*
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
*/

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthSettings, requirePlatformAdminOr401, getRequestMeta, writeAuthLog } from "@/lib/adminAccess";
import { sessionJson, unauthorized } from "@/lib/adminApi";

export async function GET() {
  const ctx = await requirePlatformAdminOr401();
  if (!ctx) return unauthorized("NOT_ADMIN");
  return sessionJson(ctx, { ok: true, settings: await getAuthSettings() });
}

export async function POST(req: Request) {
  const ctx = await requirePlatformAdminOr401();
  if (!ctx) return unauthorized("NOT_ADMIN");

  const body = await req.json().catch(() => ({}));
  const payload = {
    id: 1,
    min_password_length: Math.max(6, Number(body?.min_password_length ?? 8)),
    require_complexity: !!body?.require_complexity,
    password_max_age_days:
      body?.password_max_age_days == null || body?.password_max_age_days === ""
        ? null
        : Math.max(1, Number(body.password_max_age_days)),
    session_idle_timeout_minutes: Math.max(5, Number(body?.session_idle_timeout_minutes ?? 60)),
    auth_log_retention_days: Math.max(1, Number(body?.auth_log_retention_days ?? 180)),
    tournament_archive_days: Math.max(1, Number(body?.tournament_archive_days ?? 30)),
    max_failed_login_attempts: Math.max(1, Number(body?.max_failed_login_attempts ?? 3)),
    login_lockout_seconds: Math.max(5, Number(body?.login_lockout_seconds ?? 60)),
    updated_at: new Date().toISOString(),
    updated_by: ctx.user.id,
  };

  const { error } = await supabaseAdmin.from("admin_auth_settings").upsert(payload, { onConflict: "id" });
  if (error) {
    return sessionJson(ctx, { ok: false, error: "Не удалось сохранить параметры авторизации." }, 500);
  }

  await writeAuthLog({
    userId: ctx.user.id,
    login: ctx.user.login,
    eventType: "AUTH_SETTINGS_UPDATED",
    success: true,
    message: "Authorization settings updated",
    ...getRequestMeta(req),
  });

  return sessionJson(ctx, { ok: true, settings: await getAuthSettings() });
}
