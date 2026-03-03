// src/app/api/admin/tournament/[id]/state/route.ts
/*
Purpose: Admin “current state snapshot” for ops/dashboard.
Algorithm:

1. Require admin.
2. Load full tournament row (`tournaments.*`).
3. Load teams (id, name, points) ordered by points desc (leaderboard).
4. Load stages ordered by number desc and pick latestStage.
5. If latestStage exists, load its games ordered by court, including winner, score_text, points_awarded, is_final.
6. Return `{ tournament, teams, latestStage, games }`.
   Outcome: A compact read model for the admin UI showing the current match stage and standings.
   */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminOr401 } from "@/lib/adminAuth";

export async function GET(
    _req: Request,
    context: { params: Promise<{ id: string }> }
) {
    if (!(await requireAdminOr401())) {
        return NextResponse.json({ ok: false, error: "NOT_ADMIN" }, { status: 401 });
    }

    const { id } = await context.params;
    const tournamentId = id;

    const { data: t, error: e1 } = await supabaseAdmin
        .from("tournaments")
        .select("*")
        .eq("id", tournamentId)
        .single();

    if (e1 || !t) return NextResponse.json({ ok: false, error: e1 }, { status: 400 });

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
        tournament: t,
        teams: teams ?? [],
        latestStage,
        games: games ?? [],
    });
}
