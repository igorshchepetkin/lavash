// src/app/api/admin/tournament/[id]/registrations/accept/route.ts
/*
Purpose: Legacy/simplified “accept registration” endpoint.
Notes: overlaps with the richer POST action handler in `/registrations/route.ts`.
Algorithm:

1. Enforce admin (`requireAdmin`).
2. Parse `{ registrationId }` and load the registration row.
3. Update `registrations.status` -> `accepted`.
4. Create players according to registration mode:

   * SOLO: insert 1 player (strength defaults to `reg.strength ?? 3`).
   * TEAM: insert players for provided names (strength hardcoded to 3 here).
     Outcome: Marks a registration accepted and materializes `players`; does not create `teams`/`team_members` for TEAM mode (unlike the newer orchestration endpoint).
     */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/requireAdmin";

export async function POST(
    req: Request,
    context: { params: Promise<{ id: string }> }
) {
    await requireAdmin();

    const { id } = await context.params;
    const tournamentId = id;
    const { registrationId } = await req.json();

    const { data: reg, error: e1 } = await supabaseAdmin
        .from("registrations")
        .select("*")
        .eq("id", registrationId)
        .single();

    if (e1 || !reg) return NextResponse.json({ ok: false, error: e1 }, { status: 400 });

    // mark accepted
    const { error: e2 } = await supabaseAdmin
        .from("registrations")
        .update({ status: "accepted" })
        .eq("id", registrationId);

    if (e2) return NextResponse.json({ ok: false, error: e2 }, { status: 400 });

    // create players depending on mode
    if (reg.mode === "SOLO") {
        const { error } = await supabaseAdmin.from("players").insert({
            tournament_id: tournamentId,
            full_name: reg.solo_player,
            strength: reg.strength ?? 3,
        });
        if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
    } else {
        const names = [reg.team_player1, reg.team_player2, reg.team_player3].filter(Boolean);
        const rows = names.map((full_name: string) => ({
            tournament_id: tournamentId,
            full_name,
            strength: 3,
        }));
        const { error } = await supabaseAdmin.from("players").insert(rows);
        if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
}
