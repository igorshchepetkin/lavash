// src/app/api/admin/tournament/[id]/reset-teams/route.ts
/*
Purpose:
Remove previously built SOLO teams so the judge can rebuild them after adjusting strength or seeding.

Algorithm:

1. Require authorized tournament manager access.
2. Load tournament and reject unless:
   - mode == SOLO
   - status == draft
   - tournament not canceled
   - tournament not finished
3. Reject if tournament has already started.
4. Delete dependent rows in safe order:
   - `team_members`
   - `team_state`
   - `teams`
5. Keep player rows and registrations intact.
6. Return `{ ok:true }`.

Outcome:
Returns the SOLO setup phase to a pre-build state without losing accepted players or their strength settings.
*/

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireTournamentManagerOr401 } from "@/lib/adminAccess";
import { sessionJson, unauthorized } from "@/lib/adminApi";
import { getTournamentFlags } from "@/lib/tournamentGuards";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const tournamentId = id;
  const ctx = await requireTournamentManagerOr401(tournamentId);
  if (!ctx) {
    return unauthorized();
  }

  const f = await getTournamentFlags(tournamentId);
  if (f.canceled) return NextResponse.json({ ok: false, error: "Tournament canceled" }, { status: 400 });
  if (f.status !== "draft") {
    return NextResponse.json({ ok: false, error: "Teams can be reset only before the tournament starts" }, { status: 400 });
  }

  const { data: t, error: eT } = await supabaseAdmin
    .from("tournaments")
    .select("registration_mode")
    .eq("id", tournamentId)
    .single();

  if (eT) return NextResponse.json({ ok: false, error: eT }, { status: 400 });
  if (!t) return NextResponse.json({ ok: false, error: "Tournament not found" }, { status: 404 });
  if (t.registration_mode !== "SOLO") {
    return NextResponse.json({ ok: false, error: "reset-teams only for SOLO" }, { status: 400 });
  }

  // Find teams
  const { data: teams, error: eTeams } = await supabaseAdmin
    .from("teams")
    .select("id")
    .eq("tournament_id", tournamentId);

  if (eTeams) return NextResponse.json({ ok: false, error: eTeams }, { status: 400 });

  const teamIds = (teams ?? []).map((x: any) => x.id);

  // Delete members first
  if (teamIds.length > 0) {
    const { error: eDelMembers } = await supabaseAdmin
      .from("team_members")
      .delete()
      .in("team_id", teamIds);

    if (eDelMembers) return NextResponse.json({ ok: false, error: eDelMembers }, { status: 400 });
  }

  // Delete teams
  const { error: eDelTeams } = await supabaseAdmin
    .from("teams")
    .delete()
    .eq("tournament_id", tournamentId);

  if (eDelTeams) return NextResponse.json({ ok: false, error: eDelTeams }, { status: 400 });

  return NextResponse.json({ ok: true });
}
