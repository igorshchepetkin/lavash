import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/requireAdmin";

export async function POST(
    req: Request,
    context: { params: Promise<{ id: string }> }
) {
    requireAdmin();

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