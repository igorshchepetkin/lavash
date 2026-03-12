// src/app/api/admin/tournament/[id]/registrations/payment/route.ts
/*
Purpose:
Toggle payment confirmation for a registration slot.

Algorithm:

1. Require authorized tournament manager access.
2. Reject if registration operations are locked
   according to tournament lifecycle rules.
3. Parse JSON body:
   - registrationId
   - slot
   - paid
4. Validate:
   - registration belongs to this tournament
   - slot is valid for the mode
     * SOLO usually only slot=1
     * TEAM allows 1..3
5. Upsert the corresponding `registration_payments` row.
6. If `paid=true`, set `paid_at=now()`.
7. If `paid=false`, clear or replace payment state according to current project convention.
8. Return `{ ok:true }`.

Outcome:
Supports judge-side confirmation of participation payments and feeds the build/start payment guard.
*/

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireTournamentManagerOr401 } from "@/lib/adminAccess";
import { sessionJson, unauthorized } from "@/lib/adminApi";
import { getTournamentFlags } from "@/lib/tournamentGuards";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const tournamentId = id;
  const ctx = await requireTournamentManagerOr401(tournamentId);
  if (!ctx) {
    return unauthorized();
  }

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
