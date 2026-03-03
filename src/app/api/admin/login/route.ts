// src/app/api/admin/login/route.ts
/*
Purpose: Admin authentication entrypoint (token-based).
Algorithm:

1. Parse JSON body and read `token`.
2. Compare `token` against `process.env.ADMIN_TOKEN`.
3. If missing/mismatched -> return 401 with `{ ok:false, error:"Bad token" }`.
4. If valid -> return `{ ok:true }` and set an `admin=1` cookie with `httpOnly`, `sameSite:lax`, `path:/` (server-side session marker for further admin-guarded endpoints).
   Outcome: establishes a lightweight admin session via cookie without storing anything in DB.
   */

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { token } = await req.json();

  if (!token || token !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ ok: false, error: "Bad token" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
