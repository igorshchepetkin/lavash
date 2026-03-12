//src/app/api/admin/tournament/[id]/archive/route.ts
/*
Purpose:
Manually archive a completed or canceled tournament.

Algorithm:

1. Require role `ADMIN`.
2. Read `tournamentId` from route params.
3. Load tournament record from DB.

4. Validate:
   - tournament exists
   - tournament is not already archived
   - tournament status is either `finished` or `canceled`

5. If validation passes:
   - set `archived_at = now()`
   - set `archived_by_user_id = ctx.user.id`

6. Persist update to `tournaments`.

7. Return `{ ok:true }`.

Outcome:
Moves the tournament into the archive set so it no longer appears in
the active tournament list while preserving full historical data.
*/

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePlatformAdminOr401 } from "@/lib/adminAccess";
import { sessionJson, unauthorized } from "@/lib/adminApi";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requirePlatformAdminOr401();
  if (!ctx) return unauthorized("NOT_ADMIN");

  const { id } = await context.params;

  const { data: tournament } = await supabaseAdmin
    .from("tournaments")
    .select("id, status, archived_at")
    .eq("id", id)
    .single();

  if (!tournament?.id) {
    return NextResponse.json({ ok: false, error: "Турнир не найден." }, { status: 404 });
  }

  if (tournament.archived_at) {
    return NextResponse.json({ ok: true });
  }

  if (!["finished", "canceled"].includes(tournament.status)) {
    return NextResponse.json(
      { ok: false, error: "Архивировать можно только завершённый или отменённый турнир." },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("tournaments")
    .update({
      archived_at: new Date().toISOString(),
      archived_by_user_id: ctx.user.id,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ ok: false, error: "Не удалось архивировать турнир." }, { status: 500 });
  }

  return sessionJson(ctx, { ok: true });
}