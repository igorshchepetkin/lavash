// src/app/api/admin/auth/logout/route.ts
/*
Purpose:
Terminate the current admin session.

Algorithm:

1. Read `admin_session` cookie to obtain the session token.

2. If token exists:
   - load session from `admin_sessions`
   - if session is still open:
        set `closed_at = now()`

3. Write auth log event:
   - LOGOUT

4. Clear cookies:
   - admin_session
   - admin_csrf

5. Return `{ ok:true }`.

Outcome:
Invalidates the active session both in browser and database so further
admin requests require re-authentication.
*/

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clearSessionCookie, getRequestMeta, writeAuthLog } from "@/lib/adminAccess";

const SESSION_COOKIE = "admin_session";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? null;
  const meta = getRequestMeta(req);

  if (token) {
    const { data: session } = await supabaseAdmin
      .from("admin_sessions")
      .select(`
        id,
        user_id,
        session_token,
        closed_at,
        admin_users (
          id,
          login
        )
      `)
      .eq("session_token", token)
      .maybeSingle();

    const rawUser = Array.isArray((session as any)?.admin_users)
      ? (session as any)?.admin_users?.[0]
      : (session as any)?.admin_users;

    if (session?.id && !(session as any)?.closed_at) {
      await supabaseAdmin
        .from("admin_sessions")
        .update({ closed_at: new Date().toISOString() })
        .eq("id", (session as any).id)
        .is("closed_at", null);

      await writeAuthLog({
        userId: rawUser?.id ?? (session as any)?.user_id ?? null,
        login: rawUser?.login ?? null,
        eventType: "LOGOUT",
        success: true,
        message: "Logout ok",
        ...meta,
      });
    }
  }

  const res = NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );

  return clearSessionCookie(res);
}