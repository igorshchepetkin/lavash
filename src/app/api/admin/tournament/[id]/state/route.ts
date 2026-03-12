// src/app/api/admin/tournament/[id]/state/route.ts
/*
Purpose:
Return the operational tournament state for the match-management page.

Algorithm:

1. Require authorized admin / judge access for this tournament.
2. Load:
   - tournament row
   - chief judge display name
   - teams
   - latest stage
   - games of the latest stage
3. Return derived state used by the ops UI.

Outcome:
Supplies the ops page with the canonical current-match and ladder state.
*/

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireTournamentViewerOr401 } from "@/lib/adminAccess";
import { unauthorized } from "@/lib/adminApi";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const tournamentId = id;
  const ctx = await requireTournamentViewerOr401(tournamentId);
  if (!ctx) {
    return unauthorized();
  }

  const { data: t, error: e1 } = await supabaseAdmin
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .single();

  if (e1 || !t) return NextResponse.json({ ok: false, error: e1 }, { status: 400 });

  let chief_judge_name: string | null = null;

  if (t.chief_judge_user_id) {
    const { data: chiefJudge } = await supabaseAdmin
      .from("admin_users")
      .select("first_name, last_name, login")
      .eq("id", t.chief_judge_user_id)
      .maybeSingle();

    if (chiefJudge) {
      chief_judge_name =
        [chiefJudge.last_name, chiefJudge.first_name].filter(Boolean).join(" ").trim() ||
        chiefJudge.login ||
        null;
    }
  }

  const { data: teams } = await supabaseAdmin
    .from("teams")
    .select("id, name, points")
    .eq("tournament_id", tournamentId)
    .order("points", { ascending: false });

  const { data: stages } = await supabaseAdmin
    .from("stages")
    .select("id, number")
    .eq("tournament_id", tournamentId)
    .order("number", { ascending: false });

  const latestStage = stages?.[0] ?? null;

  const { data: games } = latestStage
    ? await supabaseAdmin
        .from("games")
        .select("id, court, team_a_id, team_b_id, winner_team_id, score_text, points_awarded, is_final, stage_id")
        .eq("stage_id", latestStage.id)
        .order("court", { ascending: true })
    : { data: [] as any[] };

  return NextResponse.json({
    ok: true,
    tournament: {
      ...t,
      chief_judge_name,
    },
    teams: teams ?? [],
    latestStage,
    games: games ?? [],
  });
}