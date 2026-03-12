// src/app/api/admin/tournament/[id]/registrations/route.ts
/*
Purpose:
Read the full registrations state for a tournament and process registration status actions.

GET algorithm:

1. Require tournament manager/viewer access.
2. Load:
   - tournament header fields
   - registrations list
   - tournament flags
   - payment rows
3. Additionally resolve chief judge name for header display.
4. Return a payload for the admin registrations page.

POST algorithm:
unchanged.
*/

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  requireTournamentViewerOr401,
  requireTournamentManagerOr401,
} from "@/lib/adminAccess";
import { unauthorized } from "@/lib/adminApi";
import { getTournamentFlags } from "@/lib/tournamentGuards";
import {
  acceptWithReserve,
  confirmReservePromotion,
  unacceptWithReserve,
} from "@/lib/reserve";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const tournamentId = id;
  const ctx = await requireTournamentViewerOr401(tournamentId);
  if (!ctx) {
    return unauthorized();
  }

  const { data: tournament, error: eT } = await supabaseAdmin
    .from("tournaments")
    .select("id, name, date, start_time, registration_mode, status, chief_judge_user_id")
    .eq("id", tournamentId)
    .single();

  if (eT || !tournament) {
    return NextResponse.json({ ok: false, error: "Tournament not found" }, { status: 404 });
  }

  let chief_judge_name: string | null = null;

  if (tournament.chief_judge_user_id) {
    const { data: chiefJudge } = await supabaseAdmin
      .from("admin_users")
      .select("first_name, last_name, login")
      .eq("id", tournament.chief_judge_user_id)
      .maybeSingle();

    if (chiefJudge) {
      chief_judge_name =
        [chiefJudge.last_name, chiefJudge.first_name].filter(Boolean).join(" ").trim() ||
        chiefJudge.login ||
        null;
    }
  }

  const { data: regs, error: eR } = await supabaseAdmin
    .from("registrations")
    .select(
      "id, status, mode, solo_player, solo_first_name, solo_last_name, phone, strength, team_player1, team_player2, team_player3, confirmation_code"
    )
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
    tournament: {
      ...tournament,
      chief_judge_name,
    },
    registrations: regs ?? [],
    flags,
    payments: pays ?? [],
  });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const tournamentId = id;
  const ctx = await requireTournamentManagerOr401(tournamentId);
  if (!ctx) {
    return unauthorized();
  }

  const f = await getTournamentFlags(tournamentId);
  if (f.canceled) return NextResponse.json({ ok: false, error: "Tournament canceled" }, { status: 400 });
  if (f.started) return NextResponse.json({ ok: false, error: "Tournament already started" }, { status: 400 });

  const { registrationId, action } = await req.json();
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

  try {
    const r = await acceptWithReserve(tournamentId, registrationId);
    return NextResponse.json({ ok: true, status: r.status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 400 });
  }
}