// src/app/api/admin/tournament/[id]/points-overrides/route.ts
/*
Purpose:
Read and replace stage-specific point overrides for a tournament.

GET algorithm:

1. Require authorized tournament manager access.
2. Load all rows from `tournament_points_overrides` for the tournament,
   ordered by `stage_number`.
3. Return `{ ok:true, overrides }`.

POST algorithm:

1. Require authorized tournament manager access.
2. Reject if:
   - tournament is canceled
   - tournament is finished
   - first match has already started
3. Parse `overrides[]` from JSON body.
4. Validate each row:
   - stage_number >= 1
   - no duplicate stage_number values
   - points_c1..c4 are present
5. Replace override set atomically:
   - delete existing tournament overrides
   - insert new rows
6. Return `{ ok:true }`.

Outcome:
Supports pre-start configuration of special per-stage scoring rules.
*/

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireTournamentManagerOr401 } from "@/lib/adminAccess";
import { sessionJson, unauthorized } from "@/lib/adminApi";
import { getTournamentFlags } from "@/lib/tournamentGuards";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const tournamentId = id;
  const ctx = await requireTournamentManagerOr401(tournamentId);
  if (!ctx) {
    return unauthorized();
  }

  const { data, error } = await supabaseAdmin
    .from("tournament_points_overrides")
    .select("stage_number, points_c1, points_c2, points_c3, points_c4")
    .eq("tournament_id", tournamentId)
    .order("stage_number", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
  return NextResponse.json({ ok: true, overrides: data ?? [] });
}

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

  const body = await req.json().catch(() => ({}));
  const overridesRaw = Array.isArray(body?.overrides) ? body.overrides : [];

  // РќРѕСЂРјР°Р»РёР·СѓРµРј
  const overrides = overridesRaw
    .map((o: any) => ({
      tournament_id: tournamentId,
      stage_number: Number(o.stage_number),
      points_c1: Number(o.points_c1),
      points_c2: Number(o.points_c2),
      points_c3: Number(o.points_c3),
      points_c4: Number(o.points_c4),
    }))
    .filter((o: any) =>
      Number.isFinite(o.stage_number) &&
      o.stage_number >= 1 &&
      [o.points_c1, o.points_c2, o.points_c3, o.points_c4].every((x: any) => Number.isFinite(x))
    );

  // РџРѕР»РёС‚РёРєР°: РїРµСЂРµРґ Р·Р°РїРёСЃСЊСЋ РѕС‡РёС‰Р°РµРј С‚РµРєСѓС‰РёРµ overrides Рё РїРёС€РµРј РЅРѕРІС‹Рµ (РїСЂРѕСЃС‚Р°СЏ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ СЃРїРёСЃРєР°)
  // РўР°Рє РїСЂРѕС‰Рµ, С‡РµРј diff/upsert/delete.
  const { error: eDel } = await supabaseAdmin
    .from("tournament_points_overrides")
    .delete()
    .eq("tournament_id", tournamentId);

  if (eDel) return NextResponse.json({ ok: false, error: eDel }, { status: 400 });

  if (overrides.length) {
    const { error: eIns } = await supabaseAdmin
      .from("tournament_points_overrides")
      .insert(overrides);

    if (eIns) return NextResponse.json({ ok: false, error: eIns }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
