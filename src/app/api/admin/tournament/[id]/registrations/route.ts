// src/app/api/admin/tournament/[id]/registrations/route.ts
/*
Purpose: Admin endpoint to view registrations and perform pre-start registration state transitions,
including main-roster acceptance, reserve handling, rollback, and manual reserve promotion.

GET algorithm (dashboard snapshot):

1. Require admin.
2. Load tournament core fields:
   - `id`, `name`, `date`, `start_time`, `registration_mode`, `status`.
3. Load all registrations for the tournament ordered by creation time, including:
   - status,
   - mode-specific player fields,
   - phone,
   - strength,
   - confirmation_code.
4. Load tournament flags via `getTournamentFlags(tournamentId)` to drive admin UI locks.
5. Load payment rows from `registration_payments` (slot-level paid status).
6. Return:
   `{ ok:true, tournament, registrations, flags, payments }`.

POST algorithm (state transitions before tournament start):

7. Require admin.
8. Load tournament flags and block mutations if:
   - tournament is canceled,
   - tournament already started.
9. Parse request body:
   `{ registrationId, action }`,
   where action ∈ { "accept", "reject", "unaccept", "confirm_reserve" }.
10. Load the target registration row.

11. If `action === "reject"`:
    - reset all payment rows for this registration to unpaid:
      `paid=false`, `paid_at=null`;
    - update registration status -> `rejected`;
    - return `{ ok:true }`.

12. If `action === "unaccept"`:
    - allow only for registrations currently in one of:
      `accepted`, `reserve`, `reserve_pending`;
    - delegate rollback to `unacceptWithReserve(tournamentId, reg)`, which:
      a) removes downstream entities if they exist
         (`team_members`, `teams`, `players`);
      b) moves registration back to `pending`;
      c) if main roster now has a free slot, promotes the oldest reserve candidate
         from `reserve` to `reserve_pending`.
    - return `{ ok:true }`.

13. If `action === "confirm_reserve"`:
    - delegate to `confirmReservePromotion(tournamentId, registrationId)`;
    - if a slot is still available, registration is promoted into the main roster
      and missing downstream entities are created;
    - if the slot is no longer available, registration returns/remains in `reserve`;
    - return:
      `{ ok:true, promoted, status }`.

14. If `action === "accept"`:
    - delegate to `acceptWithReserve(tournamentId, registrationId)`;
    - if main-roster capacity is not exceeded:
      a) update status -> `accepted`;
      b) create downstream entities needed by tournament mechanics:
         - SOLO: one `players` row;
         - TEAM: three `players`, one `teams`, and three `team_members`.
    - if main-roster capacity is already full:
      a) update status -> `reserve`;
      b) do NOT create `players`, `teams`, or `team_members`.
    - return `{ ok:true, status }`, where status is either `accepted` or `reserve`.

Reserve rules enforced through helper orchestration:

15. Main roster capacity is:
    - SOLO: 24 accepted registrations,
    - TEAM: 8 accepted registrations.
16. Registrations in `reserve` or `reserve_pending` do not participate in:
    - SOLO team build,
    - TEAM roster composition,
    - tournament match creation.
17. `reserve_pending` means:
    - a slot has opened,
    - the oldest reserve registration has been invited to move into the main roster,
    - confirmation is still required either by applicant (public flow) or by judge (this endpoint).

Outcome:
This endpoint is the central admin control point for registration lifecycle before tournament start:
it provides the judge dashboard snapshot and orchestrates all draft-stage transitions between
`pending`, `accepted`, `reserve`, `reserve_pending`, and `rejected`, while creating/removing
the downstream entities used by team building and tournament play.
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

