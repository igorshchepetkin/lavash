// src/app/api/tournament/[id]/mode/route.ts
/*
Purpose: Public read-only helper returning tournament registration_mode.
Algorithm: Query `tournaments.registration_mode` by id; return `{ ok:true, registration_mode }` or 404.
Outcome: Allows the public UI to render the correct registration form (SOLO vs TEAM).
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

    if (error || !t) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, registration_mode: t.registration_mode });
}
