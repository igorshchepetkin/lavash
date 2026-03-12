// src/app/api/admin/users/[id]/route.ts
/*
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
     * hash new password
     * set `must_change_password=true`
     * renew password lifecycle dates
6. Update `admin_users` and `updated_by`.
7. Return `{ ok:true }`.

Outcome:
Supports blocking/unblocking users and changing their role assignment while preserving audit history.
*/

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getAuthSettings,
  requirePlatformAdminOr401,
  getRequestMeta,
  writeAuthLog,
} from "@/lib/adminAccess";
import { sessionJson, unauthorized } from "@/lib/adminApi";
import { hashPassword, normalizeLogin, normalizeRoles, validatePasswordAgainstSettings } from "@/lib/adminSecurity";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requirePlatformAdminOr401();
  if (!ctx) return unauthorized("NOT_ADMIN");

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));

  const roles = normalizeRoles(body?.roles ?? []);
  const isActive = Boolean(body?.is_active);
  const firstName = String(body?.first_name ?? "").trim();
  const lastName = String(body?.last_name ?? "").trim();
  const login = normalizeLogin(body?.login);
  const unlockPassword = body?.unlock_password == null ? null : String(body.unlock_password);

  if (!firstName || !lastName || !login || roles.length === 0) {
    return sessionJson(
      ctx,
      { ok: false, error: "Заполните имя, фамилию, логин и роли." },
      400
    );
  }

  const { data: existing } = await supabaseAdmin
    .from("admin_users")
    .select("id, login, is_active")
    .eq("id", id)
    .single();

  if (!existing?.id) {
    return sessionJson(ctx, { ok: false, error: "Пользователь не найден." }, 404);
  }

  if (ctx.user.id === id && isActive === false) {
    return sessionJson(
      ctx,
      { ok: false, error: "Нельзя заблокировать самого себя." },
      400
    );
  }

  if (ctx.user.id === id && !roles.includes("ADMIN")) {
    return sessionJson(
      ctx,
      { ok: false, error: "Нельзя снять у самого себя роль администратора." },
      400
    );
  }

  if (ctx.user.id === id && existing.login !== login) {
    return sessionJson(
      ctx,
      { ok: false, error: "Нельзя менять логин собственной учётной записи." },
      400
    );
  }

  const shouldCloseSessions =
    existing.is_active !== isActive ||
    existing.login !== login ||
    Boolean(unlockPassword);

  const { data: conflict } = await supabaseAdmin
    .from("admin_users")
    .select("id")
    .eq("login", login)
    .neq("id", id)
    .maybeSingle();

  if (conflict?.id) {
    return sessionJson(
      ctx,
      { ok: false, error: "Пользователь с таким логином уже существует." },
      400
    );
  }

  const updatePayload: any = {
    first_name: firstName,
    last_name: lastName,
    login,
    roles,
    is_active: isActive,
    updated_at: new Date().toISOString(),
    updated_by: ctx.user.id,
  };

  const settings = await getAuthSettings();

  if (existing.is_active === false && isActive === true) {
    if (!unlockPassword) {
      return sessionJson(
        ctx,
        { ok: false, error: "При разблокировке нужно задать новый пароль." },
        400
      );
    }

    const validationError = validatePasswordAgainstSettings(unlockPassword, settings);
    if (validationError) {
      return sessionJson(ctx, { ok: false, error: validationError }, 400);
    }

    const now = new Date();
    updatePayload.password_hash = hashPassword(unlockPassword);
    updatePayload.must_change_password = true;
    updatePayload.password_changed_at = now.toISOString();
    updatePayload.password_expires_at = settings.password_max_age_days
      ? new Date(now.getTime() + settings.password_max_age_days * 86400_000).toISOString()
      : null;
  }

  const { error } = await supabaseAdmin.from("admin_users").update(updatePayload).eq("id", id);

  if (error) {
    return sessionJson(ctx, { ok: false, error: "Не удалось сохранить пользователя." }, 500);
  }

  if (shouldCloseSessions) {
    await supabaseAdmin
      .from("admin_sessions")
      .update({ closed_at: new Date().toISOString() })
      .eq("user_id", id)
      .is("closed_at", null);
  }

  await writeAuthLog({
    userId: id,
    login,
    eventType:
      existing.is_active === false && isActive === true
        ? "USER_UNBLOCKED"
        : existing.is_active === true && isActive === false
          ? "USER_BLOCKED"
          : "USER_UPDATED",
    success: true,
    message: `Updated by ${ctx.user.login}`,
    ...getRequestMeta(req),
  });

  return sessionJson(ctx, { ok: true });
}