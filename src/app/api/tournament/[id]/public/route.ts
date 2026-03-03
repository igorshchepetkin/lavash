// src/app/api/tournament/[id]/public/route.ts
/*
Purpose: Public “tournament showcase” endpoint: standings + latest match + UI hint for transitions.
Algorithm:

1. Load tournament public fields (including points configuration and status).
2. Load teams ordered by points desc (leaderboard).
3. Load stages ordered by number desc and pick latestStage.
4. If latestStage exists, load its games ordered by court (winner, score_text, points_awarded, is_final).
5. Compute `nextStageExists` as a UI signal:

   * If latestStage number is N, check whether stage N+1 already exists in DB.
   * This is used to hide/show arrows/transitions on the public board until the next match is actually created.
6. Return `{ tournament, teams, latestStage, games, nextStageExists }`.
   Outcome: Read model for the public screen that supports both “current match” display and controlled progression visuals.
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

    // РІР°Р¶РЅРѕ РґР»СЏ РІРёС‚СЂРёРЅС‹: РїРѕРєР°Р·Р°С‚СЊ СЃС‚СЂРµР»РєРё/РїРµСЂРµС…РѕРґС‹ С‚РѕР»СЊРєРѕ РїРѕРєР° СЃР»РµРґСѓСЋС‰РёР№ РјР°С‚С‡ РќР• СЃС‚Р°СЂС‚РѕРІР°Р»
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

    return NextResponse.json({
        ok: true,
        tournament: t,
        teams: teams ?? [],
        latestStage,
        games: games ?? [],
        nextStageExists,
    });
}
