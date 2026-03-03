// src/app/api/admin/tournament/[id]/points-overrides/route.ts
/*
Purpose: Manage per-stage point overrides (by court) before tournament start.
GET algorithm:

1. Require admin.
2. Fetch overrides for tournament ordered by `stage_number`.
3. Return `{ ok:true, overrides:[{stage_number, points_c1..points_c4}] }`.
   POST algorithm (replace-all synchronization):
4. Require admin; block if tournament canceled or started.
5. Parse `overrides` array from body and normalize numbers:

   * Keep only rows with finite stage_number>=1 and finite points_c1..c4.
   * Attach `tournament_id`.
6. Delete all existing overrides for the tournament (simple “reset then insert” policy).
7. Insert normalized overrides if any remain.
   Outcome: Provides a deterministic “single source of truth” override set, used by scoring endpoint to compute awarded points.
   */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminOr401 } from "@/lib/adminAuth";
import { getTournamentFlags } from "@/lib/tournamentGuards";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await requireAdminOr401())) {
    return NextResponse.json({ ok: false, error: "NOT_ADMIN" }, { status: 401 });
  }
  const { id } = await context.params;
  const tournamentId = id;

  const { data, error } = await supabaseAdmin
    .from("tournament_points_overrides")
    .select("stage_number, points_c1, points_c2, points_c3, points_c4")
    .eq("tournament_id", tournamentId)
    .order("stage_number", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
  return NextResponse.json({ ok: true, overrides: data ?? [] });
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await requireAdminOr401())) {
    return NextResponse.json({ ok: false, error: "NOT_ADMIN" }, { status: 401 });
  }
  const { id } = await context.params;
  const tournamentId = id;

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
