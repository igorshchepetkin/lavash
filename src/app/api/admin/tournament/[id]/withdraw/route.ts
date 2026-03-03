// src/app/api/admin/tournament/[id]/withdraw/route.ts
/*
Purpose: Withdraw (cancel) a registration before tournament start using a cancel code, with rollback if already accepted.
Notes: This endpoint does NOT enforce admin auth despite being under `/admin/...`; it behaves like a “self-service cancel with code”.
Preconditions: tournament not canceled and not started.
Algorithm:

1. Parse `{ cancel_code }` and validate it exists.
2. Find the registration by `(tournament_id, cancel_code)`. If not found -> 404.
3. If already withdrawn -> `{ ok:true }`.
4. If registration status is `accepted`, perform rollbackAccepted(registrationId):

   * Find teams linked to registration (`teams.registration_id`) and delete `team_members` then `teams`.
   * Delete players linked to registration (`players.registration_id`).
5. Update `registrations.status` -> `"withdrawn"`.
   Outcome: Ensures late cancellation cleans up any derived entities created during acceptance, keeping DB consistent.
   */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTournamentFlags } from "@/lib/tournamentGuards";

async function rollbackAccepted(registrationId: string) {
    // delete team_members -> teams -> players created from this registration
    // TEAM acceptance creates team + 3 players + team_members
    // SOLO acceptance creates player

    // Find any teams linked to registration
    const { data: teams } = await supabaseAdmin
        .from("teams")
        .select("id")
        .eq("registration_id", registrationId);

    const teamIds = (teams ?? []).map((t) => t.id);

    if (teamIds.length) {
        await supabaseAdmin.from("team_members").delete().in("team_id", teamIds);
        await supabaseAdmin.from("teams").delete().in("id", teamIds);
    }

    await supabaseAdmin.from("players").delete().eq("registration_id", registrationId);
}

export async function POST(
    req: Request,
    context: { params: Promise<{ id: string }> }
) {

    const { id } = await context.params;
    const tournamentId = id;

    const f = await getTournamentFlags(tournamentId);
    if (f.canceled) return NextResponse.json({ ok: false, error: "Tournament canceled" }, { status: 400 });
    if (f.started)  return NextResponse.json({ ok: false, error:"Tournament already started" }, { status: 400 });

    const { cancel_code } = await req.json();

    if (!cancel_code) {
        return NextResponse.json({ ok: false, error: "cancel_code required" }, { status: 400 });
    }

    const { data: reg, error } = await supabaseAdmin
        .from("registrations")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("cancel_code", cancel_code)
        .single();

    if (error || !reg) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    if (reg.status === "withdrawn") return NextResponse.json({ ok: true });

    // If accepted вЂ” rollback created entities
    if (reg.status === "accepted") {
        await rollbackAccepted(reg.id);
    }

    await supabaseAdmin.from("registrations").update({ status: "withdrawn" }).eq("id", reg.id);
    return NextResponse.json({ ok: true });
}
