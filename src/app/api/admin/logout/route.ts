// src/app/api/admin/logout/route.ts
/*
Purpose: Admin logout / session invalidation.
Algorithm:

1. Return `{ ok:true }`.
2. Overwrite `admin` cookie with empty value and `maxAge:0` (immediate expiry) while keeping `httpOnly`, `sameSite:lax`, `path:/`.
   Outcome: removes the admin session marker so subsequent admin endpoints fail authorization.
   */

import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
