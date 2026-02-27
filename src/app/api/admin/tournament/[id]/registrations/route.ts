import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminOr401 } from "@/lib/adminAuth";
import { getTournamentFlags } from "@/lib/tournamentGuards";

export async function GET(
    _req: Request,
    context: { params: Promise<{ id: string }> }
) {
    if (!(await requireAdminOr401())) {
        return NextResponse.json({ ok: false, error: "NOT_ADMIN" }, { status: 401 });
    }

    const { id } = await context.params;
    const tournamentId = id;

    const { data: tournament, error: eT } = await supabaseAdmin
        .from("tournaments")
        .select("id, name, date, start_time, registration_mode, status")
        .eq("id", tournamentId)
        .single();

    if (eT || !tournament) {
        return NextResponse.json({ ok: false, error: "Tournament not found" }, { status: 404 });
    }

    const { data: regs, error: eR } = await supabaseAdmin
        .from("registrations")
        .select("id, status, mode, solo_player, solo_first_name, solo_last_name, phone, strength, team_player1, team_player2, team_player3, confirmation_code")
        .eq("tournament_id", tournamentId)
        .order("created_at", { ascending: true });

    if (eR) return NextResponse.json({ ok: false, error: eR }, { status: 400 });

    const flags = await getTournamentFlags(tournamentId);

    const { data: pays } = await supabaseAdmin
        .from("registration_payments")
        .select("registration_id, slot, paid, paid_at")
        .eq("tournament_id", tournamentId);

    return NextResponse.json({
        ok: true,
        tournament,
        registrations: regs ?? [],
        flags,
        payments: pays ?? [],
    });
}

export async function POST(
    req: Request,
    context: { params: Promise<{ id: string }> }
) {
    if (!(await requireAdminOr401())) {
        return NextResponse.json({ ok: false, error: "NOT_ADMIN" }, { status: 401 });
    }

    const { id } = await context.params;
    const tournamentId = id;

    const f = await getTournamentFlags(tournamentId);
    if (f.canceled) return NextResponse.json({ ok: false, error: "Tournament canceled" }, { status: 400 });
    if (f.started) return NextResponse.json({ ok: false, error: "Tournament already started" }, { status: 400 });

    const { registrationId, action } = await req.json(); // action: 'accept'|'reject'
    if (!registrationId || !action) {
        return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
    }

    const { data: reg, error: e1 } = await supabaseAdmin
        .from("registrations")
        .select("*")
        .eq("id", registrationId)
        .single();

    if (e1 || !reg) return NextResponse.json({ ok: false, error: e1 }, { status: 400 });

    if (action === "reject") {
        // сбросить оплаты при reject
        const { error } = await supabaseAdmin
            .from("registration_payments")
            .update({ paid: false, paid_at: null })
            .eq("tournament_id", tournamentId)
            .eq("registration_id", registrationId);

        if (error) return NextResponse.json({ ok: false, error }, { status: 400 });

        const { error2 } = await supabaseAdmin
            .from("registrations")
            .update({ status: "rejected" })
            .eq("id", registrationId);

        if (error2) return NextResponse.json({ ok: false, error2 }, { status: 400 });

        return NextResponse.json({ ok: true });
    }

    if (action === "unaccept") {
        if (reg.status !== "accepted") {
            return NextResponse.json({ ok: false, error: "Not accepted" }, { status: 400 });
        }

        // rollback
        const { data: teams } = await supabaseAdmin
            .from("teams")
            .select("id")
            .eq("registration_id", reg.id);

        const teamIds = (teams ?? []).map((t: any) => t.id);

        if (teamIds.length) {
            await supabaseAdmin.from("team_members").delete().in("team_id", teamIds);
            await supabaseAdmin.from("teams").delete().in("id", teamIds);
        }

        await supabaseAdmin.from("players").delete().eq("registration_id", reg.id);

        await supabaseAdmin.from("registrations").update({ status: "pending" }).eq("id", reg.id);

        return NextResponse.json({ ok: true });
    }

    // accept:
    const { error: e2 } = await supabaseAdmin
        .from("registrations")
        .update({ status: "accepted" })
        .eq("id", registrationId);

    if (e2) return NextResponse.json({ ok: false, error: e2 }, { status: 400 });

    if (reg.mode === "SOLO") {
        const { error } = await supabaseAdmin.from("players").insert({
            tournament_id: tournamentId,
            full_name: reg.solo_player,
            strength: reg.strength ?? 3,
            registration_id: reg.id,
        });
        if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
        return NextResponse.json({ ok: true });
    }

    // TEAM accept: create 3 players + team + members
    const names = [reg.team_player1, reg.team_player2, reg.team_player3].filter(Boolean);
    if (names.length !== 3) {
        return NextResponse.json({ ok: false, error: "TEAM needs 3 names" }, { status: 400 });
    }

    // 1) create 3 players linked to this registration
    const { data: insertedPlayers, error: e3 } = await supabaseAdmin
        .from("players")
        .insert(
            names.map((full_name: string) => ({
                tournament_id: tournamentId,
                full_name,
                strength: reg.strength ?? 3,
                registration_id: reg.id,
            }))
        )
        .select("id, full_name");

    if (e3 || !insertedPlayers) {
        return NextResponse.json({ ok: false, error: e3 }, { status: 400 });
    }

    // 2) create team linked to this registration
    const teamName = names.join(" / ");

    const { data: team, error: e4 } = await supabaseAdmin
        .from("teams")
        .insert({
            tournament_id: tournamentId,
            name: teamName,
            points: 0,
            registration_id: reg.id,
        })
        .select("id")
        .single();

    if (e4 || !team) {
        return NextResponse.json({ ok: false, error: e4 }, { status: 400 });
    }

    // 3) create team_members
    const memberRows = insertedPlayers.map((p: any, idx: number) => ({
        team_id: team.id,
        player_id: p.id,
        slot: idx + 1,
    }));

    const { error: e5 } = await supabaseAdmin.from("team_members").insert(memberRows);
    if (e5) {
        return NextResponse.json({ ok: false, error: e5 }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
}