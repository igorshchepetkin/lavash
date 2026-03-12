import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  DEFAULT_AUTH_SETTINGS,
  hasRole,
  type AdminRole,
  type AuthSettings,
} from "@/lib/adminSecurity";

export type AdminUserRow = {
  id: string;
  first_name: string;
  last_name: string;
  login: string;
  roles: string[];
  is_active: boolean;
  must_change_password: boolean;
  password_expires_at: string | null;
};

export type AdminSessionContext = {
  user: AdminUserRow;
  sessionId: string;
  sessionToken: string;
  sessionExpiresAt: string;
  settings: AuthSettings;
  passwordExpired: boolean;
};

const SESSION_COOKIE = "admin_session";

export function getAdminSessionCookieName() {
  return SESSION_COOKIE;
}

export async function getAuthSettings(): Promise<AuthSettings> {
  const { data } = await supabaseAdmin
    .from("admin_auth_settings")
    .select("min_password_length, require_complexity, password_max_age_days, session_idle_timeout_minutes, auth_log_retention_days, tournament_archive_days, max_failed_login_attempts, login_lockout_seconds")
    .eq("id", 1)
    .maybeSingle();

  return {
    ...DEFAULT_AUTH_SETTINGS,
    ...(data ?? {}),
  };
}

export async function writeAuthLog(params: {
  userId?: string | null;
  login?: string | null;
  eventType: string;
  success: boolean;
  message?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  await supabaseAdmin.from("admin_auth_log").insert({
    user_id: params.userId ?? null,
    login: params.login ?? null,
    event_type: params.eventType,
    success: params.success,
    message: params.message ?? null,
    ip: params.ip ?? null,
    user_agent: params.userAgent ?? null,
  });
}

export async function runAdminHousekeeping() {
  const settings = await getAuthSettings();
  const retentionCutoff = new Date(Date.now() - settings.auth_log_retention_days * 86400_000).toISOString();
  await supabaseAdmin.from("admin_auth_log").delete().lt("created_at", retentionCutoff);

  const archiveCutoff = new Date(Date.now() - settings.tournament_archive_days * 86400_000).toISOString().slice(0, 10);
  await supabaseAdmin
    .from("tournaments")
    .update({ archived_at: new Date().toISOString() })
    .is("archived_at", null)
    .in("status", ["finished", "canceled"])
    .lte("date", archiveCutoff);
}

export function withSessionCookie<T extends NextResponse>(response: T, ctx: AdminSessionContext) {
  const maxAge = Math.max(60, ctx.settings.session_idle_timeout_minutes * 60);
  response.cookies.set(SESSION_COOKIE, ctx.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return response;
}

export function clearSessionCookie<T extends NextResponse>(response: T) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  response.cookies.set("admin_csrf", "", {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}

export async function getAdminSessionOrNull(): Promise<AdminSessionContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const settings = await getAuthSettings();

  const { data: session } = await supabaseAdmin
    .from("admin_sessions")
    .select(`
      id,
      session_token,
      expires_at,
      last_activity_at,
      closed_at,
      user_id,
      admin_users!inner (
        id,
        first_name,
        last_name,
        login,
        roles,
        is_active,
        must_change_password,
        password_expires_at
      )
    `)
    .eq("session_token", token)
    .maybeSingle();

  const rawUser = Array.isArray((session as any)?.admin_users)
    ? (session as any)?.admin_users?.[0]
    : (session as any)?.admin_users;

  if (!session || !rawUser?.id) return null;
  const user = rawUser as AdminUserRow;

  if ((session as any).closed_at) {
    return null;
  }

  if (!user.is_active) {
    await supabaseAdmin
      .from("admin_sessions")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", (session as any).id)
      .is("closed_at", null);
    return null;
  }

  const now = new Date();
  const expiresAt = new Date((session as any).expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
    await supabaseAdmin
      .from("admin_sessions")
      .update({ closed_at: now.toISOString() })
      .eq("id", (session as any).id);

    await writeAuthLog({
      userId: user.id,
      login: user.login,
      eventType: "SESSION_CLOSED_BY_TIMEOUT",
      success: true,
      message: "Session closed by idle timeout",
    });

    return null;
  }

  const refreshedExpiresAt = new Date(now.getTime() + settings.session_idle_timeout_minutes * 60_000).toISOString();
  await supabaseAdmin
    .from("admin_sessions")
    .update({ last_activity_at: now.toISOString(), expires_at: refreshedExpiresAt })
    .eq("id", (session as any).id);

  const passwordExpired = !!user.password_expires_at && new Date(user.password_expires_at).getTime() <= now.getTime();

  return {
    user,
    sessionId: (session as any).id,
    sessionToken: (session as any).session_token,
    sessionExpiresAt: refreshedExpiresAt,
    settings,
    passwordExpired,
  };
}

export async function requireAnyAdminUserOr401() {
  return getAdminSessionOrNull();
}

export async function requirePlatformAdminOr401() {
  const ctx = await getAdminSessionOrNull();
  if (!ctx || !hasRole(ctx.user.roles, "ADMIN")) return null;
  return ctx;
}

export async function canCreateTournament(ctx: AdminSessionContext) {
  return hasRole(ctx.user.roles, "ADMIN") || hasRole(ctx.user.roles, "CHIEF_JUDGE");
}

export async function getTournamentAccess(ctx: AdminSessionContext, tournamentId: string) {
  if (hasRole(ctx.user.roles, "ADMIN")) {
    return {
      canView: true,
      canManageTournament: true,
      canManageRegistrations: true,
      canEditSettings: true,
      canEnterResults: true,
      canCreateTournament: true,
    };
  }

  const { data: tournament } = await supabaseAdmin
    .from("tournaments")
    .select("id, chief_judge_user_id")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament?.id) {
    return {
      canView: false,
      canManageTournament: false,
      canManageRegistrations: false,
      canEditSettings: false,
      canEnterResults: false,
      canCreateTournament: false,
    };
  }

  const isChief = hasRole(ctx.user.roles, "CHIEF_JUDGE") && tournament.chief_judge_user_id === ctx.user.id;

  let isJudge = false;
  if (hasRole(ctx.user.roles, "JUDGE")) {
    const { data: judgeRow } = await supabaseAdmin
      .from("tournament_judges")
      .select("user_id")
      .eq("tournament_id", tournamentId)
      .eq("user_id", ctx.user.id)
      .maybeSingle();
    isJudge = !!judgeRow?.user_id;
  }

  return {
    canView: isChief || isJudge,
    canManageTournament: isChief,
    canManageRegistrations: isChief,
    canEditSettings: isChief,
    canEnterResults: isChief || isJudge,
    canCreateTournament: isChief,
  };
}

export async function requireTournamentManagerOr401(tournamentId: string) {
  const ctx = await getAdminSessionOrNull();
  if (!ctx) return null;
  const access = await getTournamentAccess(ctx, tournamentId);
  if (!access.canManageTournament) return null;
  return { ...ctx, access };
}

export async function requireTournamentViewerOr401(tournamentId: string) {
  const ctx = await getAdminSessionOrNull();
  if (!ctx) return null;
  const access = await getTournamentAccess(ctx, tournamentId);
  if (!access.canView && !access.canManageTournament) return null;
  return { ...ctx, access };
}

export async function requireTournamentResultWriterOr401(tournamentId: string) {
  const ctx = await getAdminSessionOrNull();
  if (!ctx) return null;
  const access = await getTournamentAccess(ctx, tournamentId);
  if (!access.canEnterResults) return null;
  return { ...ctx, access };
}

export async function listAccessibleTournaments(ctx: AdminSessionContext, archived: boolean) {
  if (hasRole(ctx.user.roles, "ADMIN")) {
    const q = supabaseAdmin
      .from("tournaments")
      .select("id, name, date, start_time, registration_mode, status, archived_at, chief_judge_user_id")
      .order("date", { ascending: false });

    archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
    const { data } = await q;
    return data ?? [];
  }

  const items = new Map<string, any>();

  if (hasRole(ctx.user.roles, "CHIEF_JUDGE")) {
    const q = supabaseAdmin
      .from("tournaments")
      .select("id, name, date, start_time, registration_mode, status, archived_at, chief_judge_user_id")
      .eq("chief_judge_user_id", ctx.user.id)
      .order("date", { ascending: false });
    archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
    const { data } = await q;
    for (const item of data ?? []) items.set(item.id, item);
  }

  if (hasRole(ctx.user.roles, "JUDGE")) {
    const { data: judgeRows } = await supabaseAdmin
      .from("tournament_judges")
      .select("tournament_id, tournaments!inner(id, name, date, start_time, registration_mode, status, archived_at, chief_judge_user_id)")
      .eq("user_id", ctx.user.id);

    for (const row of judgeRows ?? []) {
      const t = Array.isArray((row as any).tournaments) ? (row as any).tournaments[0] : (row as any).tournaments;
      if (!t?.id) continue;
      const isArchived = !!t.archived_at;
      if (archived === isArchived) items.set(t.id, t);
    }
  }

  return Array.from(items.values()).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function isPasswordChangeRequired(ctx: AdminSessionContext) {
  return ctx.user.must_change_password || ctx.passwordExpired;
}

export function getRequestMeta(req: Request) {
  return {
    ip: req.headers.get("x-forwarded-for") ?? null,
    user_agent: req.headers.get("user-agent") ?? null,
  };
}