import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthSettings } from "@/lib/adminAccess";
import { hashPassword, validatePasswordAgainstSettings } from "@/lib/adminSecurity";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const bootstrapToken = String(body?.bootstrapToken ?? "");
  if (!process.env.ADMIN_TOKEN || bootstrapToken !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ ok: false, error: "BAD_BOOTSTRAP_TOKEN" }, { status: 401 });
  }

  const { count } = await supabaseAdmin.from("admin_users").select("id", { count: "exact", head: true });
  if (Number(count ?? 0) > 0) {
    return NextResponse.json({ ok: false, error: "ALREADY_BOOTSTRAPPED" }, { status: 400 });
  }

  const firstName = String(body?.first_name ?? "").trim();
  const lastName = String(body?.last_name ?? "").trim();
  const login = String(body?.login ?? "").trim();
  const password = String(body?.password ?? "");
  const settings = await getAuthSettings();
  const validationError = validatePasswordAgainstSettings(password, settings);
  if (!firstName || !lastName || !login || validationError) {
    return NextResponse.json({ ok: false, error: validationError ?? "BAD_REQUEST" }, { status: 400 });
  }

  const now = new Date();
  const passwordExpiresAt = settings.password_max_age_days ? new Date(now.getTime() + settings.password_max_age_days * 86400_000).toISOString() : null;
  const { error } = await supabaseAdmin.from("admin_users").insert({
    first_name: firstName,
    last_name: lastName,
    login,
    password_hash: hashPassword(password),
    roles: ["ADMIN"],
    is_active: true,
    must_change_password: false,
    password_changed_at: now.toISOString(),
    password_expires_at: passwordExpiresAt,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: "BOOTSTRAP_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
