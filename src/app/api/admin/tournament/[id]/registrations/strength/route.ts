// src/app/api/admin/tournament/[id]/registrations/strength/route.ts
/*
Purpose:
Update registration-level strength before the registration is transformed into tournament mechanics.

Algorithm:

1. Require authorized tournament manager access.
2. Reject if registrations are locked:
   - tournament started
   - tournament finished
   - tournament canceled
3. Parse JSON body:
   - registrationId
   - strength
4. Validate:
   - registration belongs to this tournament
   - strength is within 1..5
5. Update `registrations.strength`.
6. For flows where player rows already exist and must stay in sync,
   apply corresponding synchronization if business logic requires it.
7. Return `{ ok:true }`.

Outcome:
Supports judge-driven calibration of participant strength at the application stage.
*/

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireTournamentManagerOr401 } from "@/lib/adminAccess";
import { sessionJson, unauthorized } from "@/lib/adminApi";
import { getTournamentFlags } from "@/lib/tournamentGuards";

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

  const { registrationId, strength } = await req.json();
  const s = Math.max(1, Math.min(5, Number(strength)));

  const { data: reg } = await supabaseAdmin
    .from("registrations")
    .select("id, mode")
    .eq("id", registrationId)
    .eq("tournament_id", tournamentId)
    .single();

  if (!reg) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // С‚РµРїРµСЂСЊ СЂР°Р·СЂРµС€Р°РµРј Рё TEAM, Рё SOLO
  const { error } = await supabaseAdmin
    .from("registrations")
    .update({ strength: s })
    .eq("id", registrationId);

  if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
