// src/app/api/tournament/[id]/reserve-confirm/route.ts
/*
Purpose:
Public API endpoint that allows a player/team from the reserve list to confirm
their transition into the main tournament roster when a slot becomes available.

This endpoint verifies the applicant's identity using the confirmation code,
phone number, and an additional identifying field (last name for SOLO mode or
any player's name for TEAM mode). If the registration is valid, the endpoint
attempts to promote the registration from reserve to the main roster.

Algorithm:

1. Parse request body and read:
   - `confirmation_code`
   - `phone`
   - `solo_last_name` (for SOLO mode)
   - `any_player_name` (for TEAM mode)

2. Validate that `confirmation_code` and `phone` are provided.
   If missing → return 400.

3. Attempt a fast lookup in the `registrations` table using:
   - `tournament_id`
   - exact `confirmation_code`

4. If the fast lookup fails, perform a fallback search:
   - load registrations for the tournament in statuses:
     `reserve_pending`, `reserve`, `accepted`
   - filter them in memory using:
       • confirmation code (case-insensitive)
       • exact phone match
       • name verification (depending on mode)

5. Validate candidate registration:
   - confirmation code matches (case-insensitive)
   - phone matches exactly
   - registration status is eligible
   - identity verification passes:
       • SOLO: last name matches
       • TEAM: provided name matches any of the three players

6. If no valid registration is found → return 404 with a generic
   "registration not found" message.

7. Call `confirmReservePromotion(tournamentId, registrationId)` which:
   - checks whether a slot in the main roster is still available
   - promotes the registration if possible
   - otherwise leaves it in reserve.

8. Return result:
   - `{ ok: true, promoted: true }` if promotion succeeded
   - `{ ok: true, promoted: false }` if the slot was already taken.

Outcome:
Provides a safe and user-friendly confirmation flow for reserve applicants,
allowing case-insensitive confirmation codes and preventing unauthorized
promotion through multi-field identity verification.
*/

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { confirmReservePromotion } from "@/lib/reserve";

function norm(s: string) {
  return (s ?? "").trim().toLowerCase();
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const tournamentId = id;

  const body = await req.json().catch(() => ({} as any));
  const confirmation_code_raw = String(body.confirmation_code ?? "").trim();
  const confirmation_code = confirmation_code_raw; // keep raw for exact check
  const confirmation_code_norm = norm(confirmation_code_raw);

  const phone = String(body.phone ?? "").trim();
  const solo_last_name = String(body.solo_last_name ?? "").trim();
  const any_player_name = String(body.any_player_name ?? "").trim();

  if (!confirmation_code_raw || !phone) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  // 1) Fast path: exact match (old behavior, but still valid)
  const { data: regExact, error: eExact } = await supabaseAdmin
    .from("registrations")
    .select("id, status, mode, phone, confirmation_code, solo_last_name, team_player1, team_player2, team_player3")
    .eq("tournament_id", tournamentId)
    .eq("confirmation_code", confirmation_code)
    .maybeSingle();

  if (eExact) {
    return NextResponse.json({ ok: false, error: "Ошибка поиска заявки" }, { status: 500 });
  }

  // helper to validate identity fields on a candidate registration
  function candidateMatches(reg: any) {
    if (!reg) return false;

    // code: case-insensitive
    if (norm(reg.confirmation_code ?? "") !== confirmation_code_norm) return false;

    // phone: exact (trimmed)
    if (String(reg.phone ?? "").trim() !== phone) return false;

    // must be in the allowed statuses for confirmation
    if (!["reserve_pending", "reserve", "accepted"].includes(String(reg.status))) {
      // (accepted allowed for idempotency or edge cases; confirmReservePromotion will decide)
      return false;
    }

    if (reg.mode === "SOLO") {
      if (!solo_last_name) return false;
      if (norm(reg.solo_last_name ?? "") !== norm(solo_last_name)) return false;
      return true;
    } else {
      if (!any_player_name) return false;
      const pool = [reg.team_player1, reg.team_player2, reg.team_player3].map((x: any) => norm(String(x ?? "")));
      return pool.includes(norm(any_player_name));
    }
  }

  // 2) If exact not found, do a safe fallback: load candidates for tournament and filter by normalized code.
  let reg = regExact;

  if (!reg) {
    const { data: regs, error: e2 } = await supabaseAdmin
      .from("registrations")
      .select("id, status, mode, phone, confirmation_code, solo_last_name, team_player1, team_player2, team_player3")
      .eq("tournament_id", tournamentId)
      .in("status", ["reserve_pending", "reserve", "accepted"])
      .order("created_at", { ascending: true });

    if (e2) {
      return NextResponse.json({ ok: false, error: "Ошибка поиска заявки" }, { status: 500 });
    }

    reg = (regs ?? []).find(candidateMatches) ?? null;
  }

  // 3) Validate identity for whichever reg we got
  if (!reg || !candidateMatches(reg)) {
    // keep the same UX message
    if (!any_player_name && reg?.mode === "TEAM") {
      return NextResponse.json({ ok: false, error: "NAME_REQUIRED" }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, error: "Заявка не найдена. Проверьте введенные данные" },
      { status: 404 }
    );
  }

  try {
    const r = await confirmReservePromotion(tournamentId, reg.id);
    return NextResponse.json({ ok: true, promoted: r.promoted, status: r.status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 400 });
  }
}