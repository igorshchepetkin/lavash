import crypto from "node:crypto";

export type AdminRole = "ADMIN" | "CHIEF_JUDGE" | "JUDGE";

export const ADMIN_ROLES: AdminRole[] = ["ADMIN", "CHIEF_JUDGE", "JUDGE"];

export function normalizeRoles(input: unknown): AdminRole[] {
  const raw = Array.isArray(input) ? input : [];
  const roles = raw
    .map((v) => String(v || "").trim().toUpperCase())
    .filter((v): v is AdminRole => ADMIN_ROLES.includes(v as AdminRole));
  return Array.from(new Set(roles));
}

export function normalizeLogin(input: unknown) {
  return String(input ?? "").trim().toLowerCase();
}

export function hasRole(roles: string[] | null | undefined, role: AdminRole) {
  return normalizeRoles(roles ?? []).includes(role);
}

export function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function generateTemporaryPassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let s = "";
  for (let i = 0; i < length; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash || !storedHash.includes(":")) return false;
  const [salt, existing] = storedHash.split(":");
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(existing, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export type AuthSettings = {
  min_password_length: number;
  require_complexity: boolean;
  password_max_age_days: number | null;
  session_idle_timeout_minutes: number;
  auth_log_retention_days: number;
  tournament_archive_days: number;
  max_failed_login_attempts: number;
  login_lockout_seconds: number;
};

export const DEFAULT_AUTH_SETTINGS: AuthSettings = {
  min_password_length: 8,
  require_complexity: true,
  password_max_age_days: 90,
  session_idle_timeout_minutes: 60,
  auth_log_retention_days: 180,
  tournament_archive_days: 30,
  max_failed_login_attempts: 3,
  login_lockout_seconds: 60,
};

export function validatePasswordAgainstSettings(password: string, settings: AuthSettings) {
  if ((password || "").length < settings.min_password_length) {
    return `Пароль должен содержать минимум ${settings.min_password_length} символов.`;
  }

  if (settings.require_complexity) {
    const checks = [/[A-Z]/, /[a-z]/, /\d/, /[^A-Za-z0-9]/];
    if (!checks.every((rx) => rx.test(password))) {
      return "Пароль должен содержать заглавные и строчные буквы, цифры и спецсимволы.";
    }
  }

  return null;
}
