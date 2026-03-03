// src/app/api/admin/tournament/[id]/mode/route.ts
/*
Purpose: Read-only admin helper to fetch a tournament registration mode.
Algorithm:

1. Read tournamentId from params.
2. Query `tournaments.registration_mode`.
3. Return `{ ok:true, registration_mode }` or 404 if not found.
   Outcome: Lightweight endpoint for admin UI to branch logic between SOLO and TEAM flows.
   */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
    _req: Request,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;

    const { data: t, error } = await supabaseAdmin
        .from("tournaments")
        .select("registration_mode")
        .eq("id", id)
        .single();

    if (error || !t) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, registration_mode: t.registration_mode });
}
