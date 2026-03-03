// src/app/api/tournament/[id]/withdraw/route.ts
/*
Purpose: Participant self-withdrawal by confirmation code before tournament start, with rollback if accepted.
Preconditions: tournament not canceled and not started.
Algorithm:

1. Parse `{ confirmation_code }`; validate present.
2. Find registration by `(tournament_id, confirmation_code)`. If not found -> 404.
3. If already withdrawn -> `{ ok:true }`.
4. If status is `accepted`, rollbackAccepted(registrationId):

   * Delete team_members and teams linked to registration (TEAM flow).
   * Delete players linked to registration (both TEAM and SOLO).
5. Update `registrations.status` -> `"withdrawn"`.
   Outcome: Ensures self-service withdrawals remain consistent even if admin already accepted the registration (removes derived entities).
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
    const { confirmation_code } = await req.json();

    const f = await getTournamentFlags(tournamentId);
    if (f.canceled) return NextResponse.json({ ok: false, error: "Tournament canceled" }, { status: 400 });
    if (f.started) return NextResponse.json({ ok: false, error: "Tournament already started" }, { status: 400 });

    if (!confirmation_code) {
        return NextResponse.json({ ok: false, error: "confirmation_code required" }, { status: 400 });
    }

    const { data: reg, error } = await supabaseAdmin
        .from("registrations")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("confirmation_code", confirmation_code)
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
