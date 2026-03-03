// src/app/api/admin/tournament/[id]/registrations/payment/route.ts
/*
Purpose: Admin toggles payment status per registration slot (supports TEAM slot 1..3; SOLO slot 1 only).
Preconditions: admin required; tournament not canceled and not started.
Algorithm:

1. Parse `{ registrationId, slot, paid }` and validate slot in [1..3].
2. Ensure registration exists for this tournament.
3. Enforce policy: payment can be recorded only if registration status is `accepted`.
4. Enforce SOLO constraint: only slot=1 allowed.
5. Upsert into `registration_payments` on conflict `(registration_id, slot)` with fields:

   * paid boolean
   * paid_at timestamp if paid=true, else null
   * tournament_id, registration_id, slot
     Outcome: Stores payment confirmation in a normalized slot-based table, used by “start/build” guards (paid acceptance checks).
     */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminOr401 } from "@/lib/adminAuth";
import { getTournamentFlags } from "@/lib/tournamentGuards";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await requireAdminOr401())) {
    return NextResponse.json({ ok: false, error: "NOT_ADMIN" }, { status: 401 });
  }

  const { id } = await context.params;
  const tournamentId = id;

  const f = await getTournamentFlags(tournamentId);
  if (f.canceled) return NextResponse.json({ ok: false, error: "Tournament canceled" }, { status: 400 });
  if (f.started)  return NextResponse.json({ ok: false, error: "Tournament already started" }, { status: 400 });

  const { registrationId, slot, paid } = await req.json();
  const s = Number(slot);
  if (!registrationId || !Number.isFinite(s) || s < 1 || s > 3) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const { data: reg } = await supabaseAdmin
    .from("registrations")
    .select("id, tournament_id, mode, status")
    .eq("id", registrationId)
    .eq("tournament_id", tournamentId)
    .single();

  if (!reg) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // РєР°Рє С‚С‹ С…РѕС‚РµР»: РїРѕРґС‚РІРµСЂР¶РґР°С‚СЊ РѕРїР»Р°С‚Сѓ РјРѕР¶РЅРѕ С‚РѕР»СЊРєРѕ РґР»СЏ accepted
  if (reg.status !== "accepted") {
    return NextResponse.json({ ok: false, error: "Payment allowed only for accepted registrations" }, { status: 400 });
  }

  if (reg.mode === "SOLO" && s !== 1) {
    return NextResponse.json({ ok: false, error: "SOLO supports only slot=1" }, { status: 400 });
  }

  const paidBool = !!paid;

  const { error } = await supabaseAdmin
    .from("registration_payments")
    .upsert(
      {
        tournament_id: tournamentId,
        registration_id: registrationId,
        slot: s,
        paid: paidBool,
        paid_at: paidBool ? new Date().toISOString() : null,
      },
      { onConflict: "registration_id,slot" }
    );

  if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
