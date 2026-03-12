// src/app/api/admin/auth/login/route.ts
/*
Purpose:
Authenticate an admin user and create a session with brute-force protection.

Algorithm:

1. Parse JSON body:
   - login
   - password

2. Normalize login:
   - trim
   - convert to lowercase.

3. Load authentication settings:
   - max_failed_login_attempts
   - login_lockout_seconds
   - session_idle_timeout_minutes
   - password policy settings.

4. Check lockout table (`admin_login_lockouts`):
   - if login is currently locked (`locked_until > now`)
     -> return error.

5. Load user from `admin_users` by normalized login.

6. Validate credentials:
   - user exists
   - user is active
   - password hash matches.

7. If credentials invalid:
   - increment `failed_count`
   - if failed_count >= max_failed_login_attempts:
        set `locked_until`
        reset failed_count
   - log auth event:
        LOGIN_FAILED or LOGIN_LOCKED
   - return 401.

8. If credentials valid:
   - clear lockout record for login
   - determine if password is expired
   - generate:
        session_token
        csrf_token

9. Create row in `admin_sessions`:
   - user_id
   - session_token
   - expires_at
   - last_activity_at
   - ip
   - user_agent

10. Write auth log:
    LOGIN_SUCCESS or LOGIN_PASSWORD_EXPIRED.

11. Set cookies:
    - admin_session (httpOnly)
    - admin_csrf (client-readable)

12. Return user info and password state flags.

Outcome:
Creates a new authenticated admin session while protecting against
password brute-force attacks and enabling CSRF protection for
subsequent API calls.
*/

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateSessionToken, normalizeLogin, verifyPassword } from "@/lib/adminSecurity";
import {
  getAuthSettings,
  getRequestMeta,
  runAdminHousekeeping,
  writeAuthLog,
} from "@/lib/adminAccess";

export async function POST(req: Request) {
  await runAdminHousekeeping();

  const body = await req.json().catch(() => ({}));
  const login = normalizeLogin(body?.login);
  const password = String(body?.password ?? "");
  const meta = getRequestMeta(req);

  if (!login || !password) {
    return NextResponse.json({ ok: false, error: "Bad credentials" }, { status: 401 });
  }

  const settings = await getAuthSettings();
  const now = new Date();

  const { data: lockoutRow } = await supabaseAdmin
    .from("admin_login_lockouts")
    .select("failed_count, locked_until")
    .eq("login", login)
    .maybeSingle();

  if (
    lockoutRow?.locked_until &&
    new Date(lockoutRow.locked_until).getTime() > now.getTime()
  ) {
    await writeAuthLog({
      login,
      eventType: "LOGIN_LOCKED",
      success: false,
      message: "Temporary lockout is active",
      ...meta,
    });

    return NextResponse.json(
      { ok: false, error: "Слишком много неудачных попыток. Попробуйте позже." },
      { status: 429 }
    );
  }

  const { data: user } = await supabaseAdmin
    .from("admin_users")
    .select("id, first_name, last_name, login, password_hash, roles, is_active, must_change_password, password_expires_at")
    .eq("login", login)
    .maybeSingle();

  const badCredentials = !user || !user.is_active || !verifyPassword(password, user.password_hash);

  if (badCredentials) {
    const failedCount = (lockoutRow?.failed_count ?? 0) + 1;
    const shouldLock = failedCount >= settings.max_failed_login_attempts;
    const lockedUntil = shouldLock
      ? new Date(now.getTime() + settings.login_lockout_seconds * 1000).toISOString()
      : null;

    await supabaseAdmin.from("admin_login_lockouts").upsert(
      {
        login,
        failed_count: shouldLock ? 0 : failedCount,
        locked_until: lockedUntil,
        updated_at: now.toISOString(),
      },
      { onConflict: "login" }
    );

    await writeAuthLog({
      userId: user?.id ?? null,
      login,
      eventType: shouldLock ? "LOGIN_LOCKED" : "LOGIN_FAILED",
      success: false,
      message: shouldLock ? "Too many failed attempts" : "Bad credentials",
      ...meta,
    });

    return NextResponse.json({ ok: false, error: "Bad credentials" }, { status: 401 });
  }

  await supabaseAdmin
    .from("admin_login_lockouts")
    .delete()
    .eq("login", login);

  const passwordExpired =
    !!user.password_expires_at &&
    new Date(user.password_expires_at).getTime() <= now.getTime();

  const token = generateSessionToken();
  const csrfToken = generateSessionToken();
  const expiresAt = new Date(
    now.getTime() + settings.session_idle_timeout_minutes * 60_000
  ).toISOString();

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("admin_sessions")
    .insert({
      user_id: user.id,
      session_token: token,
      expires_at: expiresAt,
      last_activity_at: now.toISOString(),
      ip: meta.ip,
      user_agent: meta.userAgent,
    })
    .select("id")
    .single();

  if (sessionError || !session?.id) {
    return NextResponse.json({ ok: false, error: "Session create failed" }, { status: 500 });
  }

  await writeAuthLog({
    userId: user.id,
    login: user.login,
    eventType: passwordExpired ? "LOGIN_PASSWORD_EXPIRED" : "LOGIN_SUCCESS",
    success: true,
    message: passwordExpired ? "Password expired" : "Login ok",
    ...meta,
  });

  const response = NextResponse.json({
    ok: true,
    must_change_password: !!user.must_change_password,
    password_expired: passwordExpired,
    user: {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      login: user.login,
      roles: user.roles ?? [],
    },
  });

  response.cookies.set("admin_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: settings.session_idle_timeout_minutes * 60,
  });

  response.cookies.set("admin_csrf", csrfToken, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
  });

  return response;
}