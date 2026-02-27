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

  // Нормализуем
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

  // Политика: перед записью очищаем текущие overrides и пишем новые (простая синхронизация списка)
  // Так проще, чем diff/upsert/delete.
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