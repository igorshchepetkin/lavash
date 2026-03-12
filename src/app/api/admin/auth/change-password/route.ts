// src/app/api/admin/auth/change-password/route.ts
/*
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
*/

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  requireAnyAdminUserOr401,
  getRequestMeta,
  writeAuthLog,
  getAuthSettings,
} from "@/lib/adminAccess";
import { sessionJson, unauthorized } from "@/lib/adminApi";
import {
  hashPassword,
  validatePasswordAgainstSettings,
  verifyPassword,
} from "@/lib/adminSecurity";

export async function POST(req: Request) {
  const ctx = await requireAnyAdminUserOr401();
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const currentPassword = String(body?.currentPassword ?? "");
  const newPassword = String(body?.newPassword ?? "");
  const confirmPassword = String(body?.confirmPassword ?? "");

  const { data: rawUser } = await supabaseAdmin
    .from("admin_users")
    .select("password_hash")
    .eq("id", ctx.user.id)
    .single();

  if (!verifyPassword(currentPassword, rawUser?.password_hash)) {
    return sessionJson(
      ctx,
      { ok: false, error: "Текущий пароль указан неверно.", allowPasswordChange: true },
      400
    );
  }

  if (!newPassword) {
    return sessionJson(
      ctx,
      { ok: false, error: "Новый пароль не указан.", allowPasswordChange: true },
      400
    );
  }

  const effectiveConfirmPassword = confirmPassword || newPassword;

  if (newPassword !== effectiveConfirmPassword) {
    return sessionJson(
      ctx,
      {
        ok: false,
        error: "Новый пароль и подтверждение не совпадают.",
        allowPasswordChange: true,
      },
      400
    );
  }

  if (!confirmPassword || newPassword !== confirmPassword) {
    return sessionJson(
      ctx,
      { ok: false, error: "Новый пароль и подтверждение не совпадают.", allowPasswordChange: true },
      400
    );
  }

  const settings = await getAuthSettings();
  const validationError = validatePasswordAgainstSettings(newPassword, settings);
  if (validationError) {
    return sessionJson(
      ctx,
      { ok: false, error: validationError, allowPasswordChange: true },
      400
    );
  }

  const now = new Date();
  const passwordExpiresAt = settings.password_max_age_days
    ? new Date(now.getTime() + settings.password_max_age_days * 86400_000).toISOString()
    : null;

  const { error } = await supabaseAdmin
    .from("admin_users")
    .update({
      password_hash: hashPassword(newPassword),
      must_change_password: false,
      password_changed_at: now.toISOString(),
      password_expires_at: passwordExpiresAt,
      updated_at: now.toISOString(),
      updated_by: ctx.user.id,
    })
    .eq("id", ctx.user.id);

  if (error) {
    return sessionJson(
      ctx,
      { ok: false, error: "Не удалось изменить пароль.", allowPasswordChange: true },
      500
    );
  }

  await writeAuthLog({
    userId: ctx.user.id,
    login: ctx.user.login,
    eventType: "PASSWORD_CHANGED_BY_USER",
    success: true,
    message: ctx.passwordExpired ? "Password changed after expiry" : "Password changed",
    ...getRequestMeta(req),
  });

  const refreshedCtx = {
    ...ctx,
    user: { ...ctx.user, must_change_password: false, password_expires_at: passwordExpiresAt },
    passwordExpired: false,
  };

  return sessionJson(refreshedCtx, { ok: true, allowPasswordChange: true });
}