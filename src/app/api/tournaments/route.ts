// src/app/api/tournaments/route.ts
/*
Purpose:
Return the public list of active tournaments for the site homepage.

Algorithm:

1. Load tournaments intended for public display.
2. Exclude archived tournaments from the active homepage list.
3. Return fields needed by public cards:
   - id
   - name
   - date
   - start_time
   - registration_mode
   - status
   - chief_judge_name
4. Sort by nearest / most relevant tournament order used by the UI.

Outcome:
Supplies the public home page with non-archived tournaments and their display metadata.
*/

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const archived = url.searchParams.get("archived") === "1";

  const q = supabaseAdmin
    .from("tournaments")
    .select("id, name, date, start_time, registration_mode, status, chief_judge_user_id")
    .order("date", { ascending: false });

  archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error }, { status: 400 });

  const chiefJudgeIds = Array.from(
    new Set((data ?? []).map((t) => t.chief_judge_user_id).filter(Boolean))
  );

  let chiefJudgeMap = new Map<string, string>();
  if (chiefJudgeIds.length > 0) {
    const { data: judges } = await supabaseAdmin
      .from("admin_users")
      .select("id, first_name, last_name")
      .in("id", chiefJudgeIds);

    chiefJudgeMap = new Map(
      (judges ?? []).map((u) => [u.id, `${u.last_name} ${u.first_name}`.trim()])
    );
  }

  const tournaments = (data ?? []).map((t) => ({
    ...t,
    chief_judge_name: t.chief_judge_user_id
      ? chiefJudgeMap.get(t.chief_judge_user_id) ?? null
      : null,
  }));

  return NextResponse.json({ ok: true, tournaments });
}