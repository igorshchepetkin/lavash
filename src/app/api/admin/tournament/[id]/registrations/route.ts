// src/app/api/admin/tournament/[id]/registrations/route.ts
/*
Purpose: Admin endpoint to view and manage registrations, plus create/rollback accepted entities.
GET algorithm (dashboard snapshot):

1. Require admin.
2. Load tournament core fields (id/name/date/start_time/mode/status).
3. Load registrations ordered by creation time, including mode-specific fields, phone, strength, and confirmation_code.
4. Load tournament flags (`getTournamentFlags`) to drive UI controls.
5. Load payment rows from `registration_payments` (slot-level paid status).
6. Return `{ tournament, registrations, flags, payments }`.
   POST algorithm (state transitions):
7. Require admin; block if canceled or started.
8. Parse `{ registrationId, action }` where action ∈ { "accept", "reject", "unaccept" }.
9. Load the registration row.
10. If `reject`:

    * Reset any payment rows to unpaid (paid=false, paid_at=null).
    * Update registration status -> `rejected`.
11. If `unaccept` (rollback acceptance):

    * Only allowed if status currently `accepted`.
    * Find teams linked to this registration (`teams.registration_id`).
    * Delete `team_members` then `teams` for those teamIds (TEAM flow).
    * Delete `players` linked to this registration (`players.registration_id`) (both TEAM and SOLO flows).
    * Set registration status back to `pending`.
12. If `accept`:

    * Update registration status -> `accepted`.
    * If SOLO: insert a single `players` row tied to registration (`registration_id`, strength default 3).
    * If TEAM:
      a) Validate 3 team player names.
      b) Insert 3 `players` rows linked to this registration.
      c) Create a `teams` row linked to this registration, name = `"P1 / P2 / P3"`.
      d) Insert `team_members` mapping each player to slot 1..3.
      Outcome: This endpoint is the central orchestration point where accepting/unaccepting registrations creates or deletes the downstream entities used by team building and tournament play.
      */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminOr401 } from "@/lib/adminAuth";
import { getTournamentFlags } from "@/lib/tournamentGuards";
import { acceptWithReserve, confirmReservePromotion, ensureReserveCandidate, unacceptWithReserve } from "@/lib/reserve";

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
        // СЃР±СЂРѕСЃРёС‚СЊ РѕРїР»Р°С‚С‹ РїСЂРё reject
        const { error } = await supabaseAdmin
            .from("registration_payments")
            .update({ paid: false, paid_at: null })
            .eq("tournament_id", tournamentId)
            .eq("registration_id", registrationId);

        if (error) return NextResponse.json({ ok: false, error }, { status: 400 });

        const { error: rejectError } = await supabaseAdmin
            .from("registrations")
            .update({ status: "rejected" })
            .eq("id", registrationId);

        if (rejectError) return NextResponse.json({ ok: false, error: rejectError }, { status: 400 });

        return NextResponse.json({ ok: true });
    }

    if (action === "unaccept") {
    if (reg.status !== "accepted" && reg.status !== "reserve" && reg.status !== "reserve_pending") {
        return NextResponse.json({ ok: false, error: "Not accepted" }, { status: 400 });
    }

    try {
        await unacceptWithReserve(tournamentId, reg);
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
}

if (action === "confirm_reserve") {
    try {
        const r = await confirmReservePromotion(tournamentId, registrationId);
        return NextResponse.json({ ok: true, promoted: r.promoted, status: r.status });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 400 });
    }
}

// accept:

    try {
        const r = await acceptWithReserve(tournamentId, registrationId);
        return NextResponse.json({ ok: true, status: r.status });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 400 });
    }
}

