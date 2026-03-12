// src/app/api/admin/users/[id]/reset-password/route.ts
/*
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
*/

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthSettings, requirePlatformAdminOr401, getRequestMeta, writeAuthLog } from "@/lib/adminAccess";
import { sessionJson, unauthorized } from "@/lib/adminApi";
import { hashPassword, validatePasswordAgainstSettings } from "@/lib/adminSecurity";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requirePlatformAdminOr401();
  if (!ctx) return unauthorized("NOT_ADMIN");

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  const newPassword = String(body?.password ?? "");

  const settings = await getAuthSettings();
  const validationError = validatePasswordAgainstSettings(newPassword, settings);
  if (validationError) {
    return sessionJson(ctx, { ok: false, error: validationError }, 400);
  }

  const now = new Date();
  const passwordExpiresAt = settings.password_max_age_days
    ? new Date(now.getTime() + settings.password_max_age_days * 86400_000).toISOString()
    : null;

  const { data: target } = await supabaseAdmin.from("admin_users").select("login").eq("id", id).single();
  const { error } = await supabaseAdmin
    .from("admin_users")
    .update({
      password_hash: hashPassword(newPassword),
      must_change_password: true,
      password_changed_at: now.toISOString(),
      password_expires_at: passwordExpiresAt,
      updated_at: now.toISOString(),
      updated_by: ctx.user.id,
    })
    .eq("id", id);

  if (error) {
    return sessionJson(ctx, { ok: false, error: "Не удалось сбросить пароль." }, 500);
  }

  await supabaseAdmin
    .from("admin_sessions")
    .update({ closed_at: new Date().toISOString() })
    .eq("user_id", id)
    .is("closed_at", null);

  await writeAuthLog({
    userId: id,
    login: target?.login ?? null,
    eventType: "PASSWORD_RESET_BY_ADMIN",
    success: true,
    message: `Reset by ${ctx.user.login}`,
    ...getRequestMeta(req),
  });

  return sessionJson(ctx, { ok: true });
}
