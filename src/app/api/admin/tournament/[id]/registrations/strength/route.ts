// src/app/api/admin/tournament/[id]/registrations/strength/route.ts
/*
Purpose: Admin sets/adjusts a registration’s declared strength before tournament start (both TEAM and SOLO).
Preconditions: admin required; tournament not canceled and not started.
Algorithm:

1. Parse `{ registrationId, strength }` and clamp strength to [1..5].
2. Verify the registration exists for this tournament.
3. Update `registrations.strength` with the normalized value.
   Outcome: Adjusts the strength reference used later when creating players/teams (and for strength-based initial seeding in first match).
   */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminOr401 } from "@/lib/adminAuth";
import { getTournamentFlags } from "@/lib/tournamentGuards";

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
