import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminOr401 } from "@/lib/adminAuth";
import { getTournamentFlags } from "@/lib/tournamentGuards";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdminOr401())) {
    return NextResponse.json({ ok: false, error: "NOT_ADMIN" }, { status: 401 });
  }

  const { id } = await context.params;
  const tournamentId = id;

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