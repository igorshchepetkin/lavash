// src/app/api/admin/tournament/[id]/start/route.ts
/*
Purpose:
Start the next tournament match stage by creating a new stage and 4 court games.

Algorithm:

1. Require authorized tournament operator:
   - ADMIN
   - responsible CHIEF_JUDGE
   - or allowed JUDGE according to current permissions model
2. Load tournament and guards:
   - reject if canceled
   - reject if finished
3. Enforce payment guard:
   - call `assertAllAcceptedPaid(tournamentId)`
   - reject if any accepted registration is unpaid
4. Load latest stage and its games.
5. If a previous stage exists, require all its games to have a winner.
6. Determine next stage number:
   - stage 1 if none exists
   - otherwise latestStage.number + 1
7. Before starting stage 1:
   - move all `reserve_pending` registrations back to `reserve`
8. Create a new `stages` row.
9. Determine pairings:
   - stage 1:
     * use initial tournament pairing logic
     * for SOLO, this depends on teams built from accepted/paid players
     * optional seeding and strength ordering may affect the first distribution
   - stage 2+:
     * group teams by `team_state.current_court`
     * create one game per court from the two teams currently assigned there
10. Resolve points per court:
    - use `tournament_points_overrides` for this stage if present
    - otherwise use base `tournaments.points_c1..c4`
11. Create 4 `games` rows (courts 1..4).
12. Set `tournament.status='live'` if it was still `draft`.
13. Return `{ ok:true, stageNumber, createdGames }` or equivalent payload.

Outcome:
Advances the tournament into the next playable match stage and populates the court grid.
*/

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireTournamentManagerOr401 } from "@/lib/adminAccess";
import { sessionJson, unauthorized } from "@/lib/adminApi";
import { getTournamentFlags } from "@/lib/tournamentGuards";
import { assertAllAcceptedPaid } from "@/lib/payments";

async function getTeamStrengths(tournamentId: string): Promise<Map<string, number>> {
    const { data: t } = await supabaseAdmin
        .from("tournaments")
        .select("registration_mode")
        .eq("id", tournamentId)
        .single();

    const mode = t?.registration_mode as "SOLO" | "TEAM";

    if (mode === "TEAM") {
        // team strength from registration.strength via teams.registration_id
        const { data: rows } = await supabaseAdmin
            .from("teams")
            .select("id, registration_id, registrations(strength)")
            .eq("tournament_id", tournamentId);

        const m = new Map<string, number>();
        for (const r of rows ?? []) {
            // @ts-ignore
            const s = r.registrations?.strength ?? 3;
            m.set(r.id, Number(s));
        }
        return m;
    }

    // SOLO: sum players.strength by team_members
    const { data: members } = await supabaseAdmin
        .from("team_members")
        .select("team_id, slot, players(strength)")
        .in(
            "team_id",
            (await supabaseAdmin.from("teams").select("id").eq("tournament_id", tournamentId)).data?.map((x: any) => x.id) ?? []
        );

    const m = new Map<string, number>();
    for (const tm of members ?? []) {
        // @ts-ignore
        const s = Number(tm.players?.strength ?? 3);
        m.set(tm.team_id, (m.get(tm.team_id) ?? 0) + s);
    }
    return m;
}

function shuffle<T>(a: T[]) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function orderTeamsByStrength(teamIds: string[], strengthById: Map<string, number>) {
    // group by strength desc, shuffle inside equal-strength groups
    const groups = new Map<number, string[]>();
    for (const id of teamIds) {
        const s = strengthById.get(id) ?? 0;
        groups.set(s, [...(groups.get(s) ?? []), id]);
    }

    const strengths = Array.from(groups.keys()).sort((a, b) => b - a);
    const ordered: string[] = [];
    for (const s of strengths) {
        const arr = groups.get(s)!;
        shuffle(arr);
        ordered.push(...arr);
    }
    return ordered;
}

type SeededPair = { court: number; teamA: string; teamB: string };

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    const tournamentId = id;
    const ctx = await requireTournamentManagerOr401(tournamentId);
    if (!ctx) {
        return unauthorized();
    }

    const f = await getTournamentFlags(tournamentId);
    if (f.canceled) return NextResponse.json({ ok: false, error: "Tournament canceled" }, { status: 400 });
    if (f.status === "finished") return NextResponse.json({ ok: false, error: "Tournament finished" }, { status: 400 });

    try {
        // Once the first match starts, any reserve candidates can no longer be promoted.
await supabaseAdmin
    .from("registrations")
    .update({ status: "reserve" })
    .eq("tournament_id", tournamentId)
    .eq("status", "reserve_pending");

await assertAllAcceptedPaid(tournamentId);
    } catch {
        return NextResponse.json({ ok: false, error: "Р•СЃС‚СЊ РїРѕРґС‚РІРµСЂР¶РґС‘РЅРЅС‹Рµ Р·Р°СЏРІРєРё Р±РµР· РІР·РЅРѕСЃР°" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const seededPairs: SeededPair[] = body?.seededPairs ?? [];

    // 1) last stage + guard: previous match must be complete
    const { data: lastStage, error: eLast } = await supabaseAdmin
        .from("stages")
        .select("id, number")
        .eq("tournament_id", tournamentId)
        .order("number", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (eLast) return NextResponse.json({ ok: false, error: eLast }, { status: 400 });

    if (lastStage?.id) {
        const { data: lastGames, error: eLG } = await supabaseAdmin
            .from("games")
            .select("id, winner_team_id")
            .eq("stage_id", lastStage.id);

        if (eLG) return NextResponse.json({ ok: false, error: eLG }, { status: 400 });

        const complete = (lastGames?.length ?? 0) > 0 && lastGames!.every((g) => !!g.winner_team_id);
        if (!complete) {
            return NextResponse.json({ ok: false, error: "Previous match is not complete" }, { status: 400 });
        }
    }

    const nextNumber = (lastStage?.number ?? 0) + 1;

    // 2) load teams (must be 8)
    const { data: teams, error: eTeams } = await supabaseAdmin
        .from("teams")
        .select("id")
        .eq("tournament_id", tournamentId);

    if (eTeams) return NextResponse.json({ ok: false, error: eTeams }, { status: 400 });

    if (!teams || teams.length !== 8) {
        return NextResponse.json({ ok: false, error: `РќСѓР¶РЅРѕ 8 РєРѕРјР°РЅРґ, СЃРµР№С‡Р°СЃ ${teams?.length ?? 0}` }, { status: 400 });
    }

    // 3) Build games for this stage
    // If not first match -> pair by current courts from team_state (this is the "movement" effect)
    // If first match -> seededPairs + random fill
    const games: Array<{ court: number; team_a_id: string; team_b_id: string }> = [];

    if (lastStage?.id) {
        const { data: states, error: eS } = await supabaseAdmin
            .from("team_state")
            .select("team_id, current_court")
            .eq("tournament_id", tournamentId);

        if (eS) return NextResponse.json({ ok: false, error: eS }, { status: 400 });

        const byCourt = new Map<number, string[]>();
        for (const s of states ?? []) {
            const arr = byCourt.get(s.current_court) ?? [];
            arr.push(s.team_id);
            byCourt.set(s.current_court, arr);
        }

        for (const court of [1, 2, 3, 4] as const) {
            const ts = byCourt.get(court) ?? [];
            if (ts.length !== 2) {
                return NextResponse.json(
                    { ok: false, error: `РќР° РєРѕСЂС‚Рµ ${court} РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ 2 РєРѕРјР°РЅРґС‹, СЃРµР№С‡Р°СЃ ${ts.length}` },
                    { status: 400 }
                );
            }
            games.push({ court, team_a_id: ts[0], team_b_id: ts[1] });
        }
    } else {
        // first match: ignore random, use strength-based placement (+ random only within equal strength)

        const teamIds = teams.map((t) => t.id);

        const strengthById = await getTeamStrengths(tournamentId);
        const ordered = orderTeamsByStrength(teamIds, strengthById);

        if (ordered.length !== 8) {
            return NextResponse.json({ ok: false, error: "РќСѓР¶РЅРѕ 8 РєРѕРјР°РЅРґ РґР»СЏ СЃС‚Р°СЂС‚Р°" }, { status: 400 });
        }

        // pairs: strongest on court 4, next on 3, next on 2, weakest on 1
        const courtByPairIndex = [4, 3, 2, 1] as const;

        for (let i = 0; i < 4; i++) {
            const court = courtByPairIndex[i];
            const teamA = ordered[i * 2];
            const teamB = ordered[i * 2 + 1];
            games.push({ court, team_a_id: teamA, team_b_id: teamB });
        }
    }

    // 4) Create new stage
    const { data: stage, error: e1 } = await supabaseAdmin
        .from("stages")
        .insert({ tournament_id: tournamentId, number: nextNumber })
        .select("id")
        .single();

    if (e1 || !stage) return NextResponse.json({ ok: false, error: e1 }, { status: 400 });

    // 5) Insert games
    const { error: e2 } = await supabaseAdmin.from("games").insert(
        games.map((g) => ({ tournament_id: tournamentId, stage_id: stage.id, ...g }))
    );
    if (e2) return NextResponse.json({ ok: false, error: e2 }, { status: 400 });

    // 6) Update/insert team_state to reflect "current match courts"
    const stateRows = games.flatMap((g) => [
        { tournament_id: tournamentId, team_id: g.team_a_id, current_court: g.court },
        { tournament_id: tournamentId, team_id: g.team_b_id, current_court: g.court },
    ]);

    if (!lastStage?.id) {
        const { error: e3 } = await supabaseAdmin.from("team_state").insert(stateRows);
        if (e3) return NextResponse.json({ ok: false, error: e3 }, { status: 400 });
    } else {
        for (const row of stateRows) {
            const { error: eU } = await supabaseAdmin
                .from("team_state")
                .update({ current_court: row.current_court })
                .eq("tournament_id", tournamentId)
                .eq("team_id", row.team_id);

            if (eU) return NextResponse.json({ ok: false, error: eU }, { status: 400 });
        }
    }

    await supabaseAdmin.from("tournaments").update({ status: "live" }).eq("id", tournamentId);

    return NextResponse.json({ ok: true, stageNumber: nextNumber });
}
