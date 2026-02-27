import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminOr401 } from "@/lib/adminAuth";
import { getTournamentFlags } from "@/lib/tournamentGuards";

function clamp(v: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, v));
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
    if (!(await requireAdminOr401())) {
        return NextResponse.json({ ok: false, error: "NOT_ADMIN" }, { status: 401 });
    }

    const { id } = await context.params;
    const tournamentId = id;

    const f = await getTournamentFlags(tournamentId);
    if (f.canceled) return NextResponse.json({ ok: false, error: "Tournament canceled" }, { status: 400 });

    const { gameId, winnerTeamId, scoreText } = await req.json();
    if (!gameId || !winnerTeamId) {
        return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
    }

    const { data: t } = await supabaseAdmin
        .from("tournaments")
        .select("points_c1, points_c2, points_c3, points_c4, status")
        .eq("id", tournamentId)
        .single();

    const { data: g } = await supabaseAdmin
        .from("games")
        .select("id, stage_id, court, team_a_id, team_b_id, winner_team_id")
        .eq("id", gameId)
        .single();

    if (!t || !g) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (t.status === "finished") return NextResponse.json({ ok: false, error: "Tournament finished" }, { status: 400 });
    if (g.winner_team_id) return NextResponse.json({ ok: false, error: "Already scored" }, { status: 400 });

    // validate winnerTeamId is one of teams in this game
    if (winnerTeamId !== g.team_a_id && winnerTeamId !== g.team_b_id) {
        return NextResponse.json({ ok: false, error: "Winner is not in this game" }, { status: 400 });
    }

    const { data: st } = await supabaseAdmin
        .from("stages")
        .select("number")
        .eq("id", g.stage_id)
        .single();

    const stageNumber = st?.number ?? null;

    let pC1 = t.points_c1, pC2 = t.points_c2, pC3 = t.points_c3, pC4 = t.points_c4;

    if (stageNumber != null) {
        const { data: ov } = await supabaseAdmin
            .from("tournament_points_overrides")
            .select("points_c1, points_c2, points_c3, points_c4")
            .eq("tournament_id", tournamentId)
            .eq("stage_number", stageNumber)
            .maybeSingle();

        if (ov) {
            pC1 = ov.points_c1; pC2 = ov.points_c2; pC3 = ov.points_c3; pC4 = ov.points_c4;
        }
    }

    const points =
        g.court === 1 ? pC1 :
            g.court === 2 ? pC2 :
                g.court === 3 ? pC3 :
                    pC4;

    const loserTeamId = winnerTeamId === g.team_a_id ? g.team_b_id : g.team_a_id;

    // 1) save game result (NO auto-next-stage, NO final flag here)
    const { error: eUpd } = await supabaseAdmin
        .from("games")
        .update({
            winner_team_id: winnerTeamId,
            score_text: scoreText ?? null,
            points_awarded: points,
        })
        .eq("id", gameId);

    if (eUpd) return NextResponse.json({ ok: false, error: eUpd }, { status: 400 });

    // 2) increment winner points
    const { data: teamRow, error: eTeam } = await supabaseAdmin
        .from("teams")
        .select("points")
        .eq("id", winnerTeamId)
        .single();

    if (eTeam) return NextResponse.json({ ok: false, error: eTeam }, { status: 400 });

    const { error: ePts } = await supabaseAdmin
        .from("teams")
        .update({ points: (teamRow?.points ?? 0) + points })
        .eq("id", winnerTeamId);

    if (ePts) return NextResponse.json({ ok: false, error: ePts }, { status: 400 });

    // 3) move courts: winner up (towards 1), loser down (towards 4)
    const winNewCourt = clamp(g.court - 1, 1, 4);
    const loseNewCourt = clamp(g.court + 1, 1, 4);

    const { error: eS1 } = await supabaseAdmin
        .from("team_state")
        .update({ current_court: winNewCourt })
        .eq("tournament_id", tournamentId)
        .eq("team_id", winnerTeamId);

    if (eS1) return NextResponse.json({ ok: false, error: eS1 }, { status: 400 });

    const { error: eS2 } = await supabaseAdmin
        .from("team_state")
        .update({ current_court: loseNewCourt })
        .eq("tournament_id", tournamentId)
        .eq("team_id", loserTeamId);

    if (eS2) return NextResponse.json({ ok: false, error: eS2 }, { status: 400 });

    // 4) tell UI whether whole current match is complete (for enabling Start button)
    const { data: stageGames, error: eSG } = await supabaseAdmin
        .from("games")
        .select("id, winner_team_id")
        .eq("stage_id", g.stage_id);

    if (eSG) return NextResponse.json({ ok: false, error: eSG }, { status: 400 });

    const stageComplete = (stageGames ?? []).length > 0 && (stageGames ?? []).every((x) => !!x.winner_team_id);

    return NextResponse.json({ ok: true, stageComplete });
}