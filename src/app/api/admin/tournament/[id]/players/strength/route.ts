// src/app/api/admin/tournament/[id]/players/strength/route.ts
/*
Purpose:
Update strength of an already materialized player row (typically SOLO flow before match 1).

Algorithm:

1. Require authorized tournament manager access.
2. Reject if:
   - tournament canceled
   - tournament finished
   - teams are already built and current business rules lock strength changes
   - tournament already moved past the editable pre-start state
3. Parse JSON body:
   - playerId
   - strength
4. Validate:
   - player belongs to this tournament
   - strength is within 1..5
5. Update `players.strength`.
6. Return `{ ok:true }`.

Outcome:
Lets the judge refine the competitive level of a player before final team composition is frozen.
*/

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireTournamentManagerOr401 } from "@/lib/adminAccess";
import { sessionJson, unauthorized } from "@/lib/adminApi";
import { getTournamentFlags } from "@/lib/tournamentGuards";

function clampInt(v: any, lo: number, hi: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
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
  if (f.canceled) {
    return NextResponse.json({ ok: false, error: "Tournament canceled" }, { status: 400 });
  }
  if (f.started) {
    return NextResponse.json({ ok: false, error: "Tournament already started" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const playerId = String(body.playerId ?? "");
  const strength = clampInt(body.strength, 1, 5);

  if (!playerId) {
    return NextResponse.json({ ok: false, error: "playerId required" }, { status: 400 });
  }

  // validate player belongs to this tournament
  const { data: p, error: eP } = await supabaseAdmin
    .from("players")
    .select("id")
    .eq("id", playerId)
    .eq("tournament_id", tournamentId)
    .single();

  if (eP) return NextResponse.json({ ok: false, error: eP }, { status: 400 });
  if (!p) return NextResponse.json({ ok: false, error: "Player not found" }, { status: 404 });

  const { error: eU } = await supabaseAdmin
    .from("players")
    .update({ strength })
    .eq("id", playerId)
    .eq("tournament_id", tournamentId);

  if (eU) return NextResponse.json({ ok: false, error: eU }, { status: 400 });

  return NextResponse.json({ ok: true });
}
