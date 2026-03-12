// src/app/api/tournament/[id]/public/route.ts
/*
Purpose:
Build the full public showcase payload for one tournament.

Algorithm:

1. Read `tournamentId` from params.
2. Load tournament core metadata:
   - name
   - date
   - start_time
   - registration_mode
   - status
   - chief_judge_name
   - base points
3. Load current teams and current/latest stage games.
4. Load public-facing registrations when relevant.
5. Build public display state:
   - before teams exist / before first match in some modes -> show registrations
   - after teams exist or tournament is already in progress -> show team rating
6. Ensure reserve registrations are shown only in the intended pre-start scenarios,
   with reserve rows grouped at the bottom.
7. Return:
   - tournament
   - teams
   - games
   - registrations
   - latestStage
   - helper flags like `nextStageExists` if used by UI

Outcome:
Provides the single public tournament page with all data needed for
header, registrations/rating block, and current match courts.
*/

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
    _req: Request,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const tournamentId = id;

    const { data: t, error: e1 } = await supabaseAdmin
        .from("tournaments")
        .select("id, name, date, start_time, registration_mode, status, points_c1, points_c2, points_c3, points_c4")
        .eq("id", tournamentId)
        .single();

    if (e1 || !t) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

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
            .select("id, court, team_a_id, team_b_id, winner_team_id, score_text, points_awarded, is_final")
            .eq("stage_id", latestStage.id)
            .order("court", { ascending: true })
        : { data: [] as any[] };

    // важно для витрины: показать стрелки/переходы только пока следующий матч НЕ стартовал
    const latestNum = latestStage?.number ?? 0;

    const { data: nextStageRow } = latestNum
        ? await supabaseAdmin
            .from("stages")
            .select("id, number")
            .eq("tournament_id", tournamentId)
            .eq("number", latestNum + 1)
            .maybeSingle()
        : { data: null as any };

    const nextStageExists = !!nextStageRow;

    // For draft tournaments we expose the list of "accepted by judge" registrations.
    // This includes both main (accepted) and reserve (reserve/reserve_pending) statuses.
    // UI decides how to render / label them. We intentionally do NOT expose pending/rejected here.
    const { data: acceptedRegs } =
        t.status === "draft"
            ? await supabaseAdmin
                .from("registrations")
                .select("id, status, mode, solo_player, team_player1, team_player2, team_player3, created_at")
                .eq("tournament_id", tournamentId)
                .in("status", ["accepted", "reserve", "reserve_pending"])
                .order("created_at", { ascending: true })
            : { data: [] as any[] };

    const registrations = (acceptedRegs ?? []).map((r: any) => {
        const full_name =
            r.mode === "SOLO"
                ? r.solo_player
                : [r.team_player1, r.team_player2, r.team_player3].filter(Boolean).join(" / ");

        return {
            id: r.id,
            status: r.status,
            is_reserve: r.status === "reserve" || r.status === "reserve_pending",
            full_name,
            created_at: r.created_at,
        };
    });

    // Keep reserve list for compatibility, but UI should generally use `registrations`.
    const reserve = registrations.filter((r: any) => r.is_reserve);

    return NextResponse.json({
        ok: true,
        tournament: t,
        teams: teams ?? [],
        latestStage,
        games: games ?? [],
        nextStageExists,
        registrations,
        reserve,
    });
}