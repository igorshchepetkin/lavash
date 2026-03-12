import { NextResponse } from "next/server";
import { clearSessionCookie, isPasswordChangeRequired, withSessionCookie, type AdminSessionContext } from "@/lib/adminAccess";

export function unauthorized(error = "NOT_AUTHORIZED") {
  return NextResponse.json({ ok: false, error }, { status: 401 });
}

export function forbidden(error = "FORBIDDEN") {
  return NextResponse.json({ ok: false, error }, { status: 403 });
}

export function sessionJson(ctx: AdminSessionContext, payload: Record<string, any>, status = 200) {
  const response = NextResponse.json(payload, { status });
  if (isPasswordChangeRequired(ctx) && !String(payload?.allowPasswordChange ?? false)) {
    response.headers.set("x-admin-password-change-required", "1");
  }
  return withSessionCookie(response, ctx);
}

export function logoutJson(payload: Record<string, any> = { ok: true }, status = 200) {
  return clearSessionCookie(NextResponse.json(payload, { status }));
}
