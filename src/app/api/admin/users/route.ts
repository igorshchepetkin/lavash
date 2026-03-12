// src/app/api/admin/users/route.ts
/*
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

export async function GET() {
  const ctx = await requirePlatformAdminOr401();
  if (!ctx) return unauthorized("NOT_ADMIN");

  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select(`
      id,
      first_name,
      last_name,
      login,
      roles,
      is_active,
      must_change_password,
      password_changed_at,
      password_expires_at,
      created_at,
      created_by
    `)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) {
    return sessionJson(ctx, { ok: false, error: "Не удалось загрузить пользователей." }, 500);
  }

  const rows = data ?? [];
  const creatorIds = Array.from(
    new Set(rows.map((row: any) => row.created_by).filter(Boolean))
  );

  let creatorsMap = new Map<
    string,
    { id: string; first_name: string | null; last_name: string | null; login: string | null }
  >();

  if (creatorIds.length > 0) {
    const { data: creators, error: creatorsError } = await supabaseAdmin
      .from("admin_users")
      .select("id, first_name, last_name, login")
      .in("id", creatorIds);

    if (creatorsError) {
      return sessionJson(ctx, { ok: false, error: "Не удалось загрузить пользователей." }, 500);
    }

    creatorsMap = new Map(
      (creators ?? []).map((u: any) => [
        u.id,
        {
          id: u.id,
          first_name: u.first_name ?? null,
          last_name: u.last_name ?? null,
          login: u.login ?? null,
        },
      ])
    );
  }

  const users = rows.map((row: any) => ({
    ...row,
    created_by_user: row.created_by ? creatorsMap.get(row.created_by) ?? null : null,
  }));

  return sessionJson(ctx, { ok: true, users });
}

export async function POST(req: Request) {
  const ctx = await requirePlatformAdminOr401();
  if (!ctx) return unauthorized("NOT_ADMIN");

  const body = await req.json().catch(() => ({}));
  const firstName = String(body?.first_name ?? "").trim();
  const lastName = String(body?.last_name ?? "").trim();
  const login = normalizeLogin(body?.login);
  const password = String(body?.password ?? "");
  const roles = normalizeRoles(body?.roles ?? []);
  const isActive = body?.is_active == null ? true : Boolean(body.is_active);

  if (!firstName || !lastName || !login || !password || roles.length === 0) {
    return sessionJson(
      ctx,
      { ok: false, error: "Заполните имя, фамилию, логин, пароль и хотя бы одну роль." },
      400
    );
  }

  const settings = await getAuthSettings();
  const validationError = validatePasswordAgainstSettings(password, settings);
  if (validationError) {
    return sessionJson(ctx, { ok: false, error: validationError }, 400);
  }

  const { data: existing } = await supabaseAdmin
    .from("admin_users")
    .select("id")
    .eq("login", login)
    .maybeSingle();

  if (existing?.id) {
    return sessionJson(
      ctx,
      { ok: false, error: "Пользователь с таким логином уже существует." },
      400
    );
  }

  const now = new Date();
  const passwordExpiresAt = settings.password_max_age_days
    ? new Date(now.getTime() + settings.password_max_age_days * 86400_000).toISOString()
    : null;

  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .insert({
      first_name: firstName,
      last_name: lastName,
      login,
      password_hash: hashPassword(password),
      roles,
      is_active: isActive,
      must_change_password: true,
      password_changed_at: now.toISOString(),
      password_expires_at: passwordExpiresAt,
      created_by: ctx.user.id,
      updated_by: ctx.user.id,
      updated_at: now.toISOString(),
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return sessionJson(ctx, { ok: false, error: "Не удалось создать пользователя." }, 500);
  }

  await writeAuthLog({
    userId: data.id,
    login,
    eventType: "USER_CREATED",
    success: true,
    message: `Created by ${ctx.user.login}`,
    ...getRequestMeta(req),
  });

  return sessionJson(ctx, { ok: true, id: data.id });
}