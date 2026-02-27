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
  if (f.started) return NextResponse.json({ ok: false, error: "Tournament already started" }, { status: 400 });

  const { data: t } = await supabaseAdmin
    .from("tournaments")
    .select("registration_mode")
    .eq("id", tournamentId)
    .single();

  if (!t) return NextResponse.json({ ok: false, error: "Tournament not found" }, { status: 404 });
  if (t.registration_mode !== "SOLO") return NextResponse.json({ ok: false, error: "Not SOLO" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const playerId = String(body.playerId ?? "");
  const seedTeamIndexRaw = body.seed_team_index;

  if (!playerId) return NextResponse.json({ ok: false, error: "playerId required" }, { status: 400 });

  const seed_team_index =
    seedTeamIndexRaw == null || seedTeamIndexRaw === ""
      ? null
      : Math.max(1, Math.min(8, Number(seedTeamIndexRaw)));

  // validate player belongs to this tournament
  const { data: p } = await supabaseAdmin
    .from("players")
    .select("id")
    .eq("id", playerId)
    .eq("tournament_id", tournamentId)
    .single();

  if (!p) return NextResponse.json({ ok: false, error: "Player not found" }, { status: 404 });

  // enforce max 8 seeds
  const { data: seededNow } = await supabaseAdmin
    .from("players")
    .select("id, seed_team_index")
    .eq("tournament_id", tournamentId)
    .not("seed_team_index", "is", null);

  const alreadySeeded = (seededNow ?? []).find((x: any) => x.id === playerId)?.seed_team_index != null;
  const seedsCount = (seededNow ?? []).length;

  if (!alreadySeeded && seed_team_index != null && seedsCount >= 8) {
    return NextResponse.json({ ok: false, error: "Нельзя посеять более 8 игроков" }, { status: 400 });
  }

  // update (db has unique index (tournament_id, seed_team_index) where not null)
  const { error: eU } = await supabaseAdmin
    .from("players")
    .update({
      seed_team_index,
      seed_slot: seed_team_index != null ? 1 : null, // slot нам пока не нужен, но пусть будет валидным
    })
    .eq("id", playerId)
    .eq("tournament_id", tournamentId);

  if (eU) {
    // ожидаемая ошибка — конфликт уникального индекса (занята команда)
    return NextResponse.json({ ok: false, error: eU }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}