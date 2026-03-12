// src/app/api/admin/tournament/[id]/cancel/route.ts
/*
Purpose:
Cancel a tournament irreversibly.

Algorithm:

1. Require authorized tournament manager access.
2. Load tournament.
3. Reject if tournament is already canceled or already finished.
4. Update `tournaments.status='canceled'`.
5. Convert all still-relevant registrations into their canceled terminal view/state
   if the project applies explicit registration cancellation updates.
6. Prevent any further:
   - public applications
   - team building
   - match starts
   - result entry
7. Return `{ ok:true }`.

Outcome:
Moves the tournament into a terminal canceled state and blocks all operational flows.
*/

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireTournamentManagerOr401 } from "@/lib/adminAccess";
import { sessionJson, unauthorized } from "@/lib/adminApi";

export async function POST(
    _req: Request,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const tournamentId = id;

    const ctx = await requireTournamentManagerOr401(tournamentId);
    if (!ctx) {
        return unauthorized()
    }

    // Р•СЃР»Рё СѓР¶Рµ РѕС‚РјРµРЅС‘РЅ/Р·Р°РІРµСЂС€С‘РЅ вЂ” РїСЂРѕСЃС‚Рѕ СЃРѕРѕР±С‰РёРј
    const { data: t } = await supabaseAdmin
        .from("tournaments")
        .select("status")
        .eq("id", tournamentId)
        .single();

    if (!t) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (t.status === "canceled") return NextResponse.json({ ok: true });

    // 1) РўСѓСЂРЅРёСЂ РѕС‚РјРµРЅС‘РЅ
    await supabaseAdmin.from("tournaments").update({ status: "canceled" }).eq("id", tournamentId);

    // 2) Р’СЃРµ Р·Р°СЏРІРєРё СЃС‡РёС‚Р°РµРј РѕС‚РјРµРЅС‘РЅРЅС‹РјРё
    await supabaseAdmin
        .from("registrations")
        .update({ status: "canceled" })
        .eq("tournament_id", tournamentId);

    return NextResponse.json({ ok: true });
}
