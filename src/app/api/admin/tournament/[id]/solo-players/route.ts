import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminOr401 } from "@/lib/adminAuth";

function clampInt(v: any, lo: number, hi: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

type PlayerRow = {
  id: string;
  full_name: string;
  strength: number;
  seed_team_index: number | null;
  seed_slot: number | null;
};

// Fast deterministic string hash (FNV-1a 32-bit)
function hash32FNV1a(str: string): number {
  let h = 0x811c9dc5; // 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministic sorting for buckets:
 *  - strength desc
 *  - hash(id + tournamentId) asc
 *  - id asc
 */
function sortPlayersDeterministic(players: PlayerRow[], tournamentId: string) {
  return [...players]
    .map((p) => ({ ...p, strength: clampInt(p.strength ?? 3, 1, 5) }))
    .sort((a, b) => {
      if (b.strength !== a.strength) return b.strength - a.strength;

      const ha = hash32FNV1a(String(a.id) + tournamentId);
      const hb = hash32FNV1a(String(b.id) + tournamentId);
      if (ha !== hb) return ha - hb;

      return String(a.id).localeCompare(String(b.id));
    });
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdminOr401())) {
    return NextResponse.json({ ok: false, error: "NOT_ADMIN" }, { status: 401 });
  }

  const { id } = await context.params;
  const tournamentId = id;

  // 1) players
  const { data: playersRaw, error: eP } = await supabaseAdmin
    .from("players")
    .select("id, full_name, strength, seed_team_index, seed_slot")
    .eq("tournament_id", tournamentId);

  if (eP) return NextResponse.json({ ok: false, error: eP }, { status: 400 });

  const players = (playersRaw ?? []) as PlayerRow[];
  if (players.length === 0) {
    return NextResponse.json({ ok: true, players: [] });
  }

  // 2) deterministic buckets
  const sorted = sortPlayersDeterministic(players, tournamentId);

  const bucketByPlayer = new Map<string, 1 | 2 | 3>();
  for (let i = 0; i < sorted.length; i++) {
    const bucket: 1 | 2 | 3 = i < 8 ? 1 : i < 16 ? 2 : 3;
    bucketByPlayer.set(sorted[i].id, bucket);
  }

  // 3) if teams are built, map player -> team_index / team_slot
  const { data: teams, error: eT } = await supabaseAdmin
    .from("teams")
    .select("id, created_at")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: true });

  if (eT) return NextResponse.json({ ok: false, error: eT }, { status: 400 });

  const teamIndexById = new Map<string, number>();
  (teams ?? []).forEach((t: any, idx: number) => teamIndexById.set(t.id, idx + 1));

  const teamIds = (teams ?? []).map((x: any) => x.id);

  let members: any[] = [];
  if (teamIds.length > 0) {
    const { data: membersRaw, error: eM } = await supabaseAdmin
      .from("team_members")
      .select("team_id, player_id, slot")
      .in("team_id", teamIds);

    if (eM) return NextResponse.json({ ok: false, error: eM }, { status: 400 });
    members = (membersRaw ?? []) as any[];
  }

  const teamSlotByPlayer = new Map<string, number>();
  const teamIndexByPlayer = new Map<string, number>();

  for (const m of members) {
    if (m.slot != null) teamSlotByPlayer.set(m.player_id, Number(m.slot));

    const idx = teamIndexById.get(m.team_id);
    if (idx) teamIndexByPlayer.set(m.player_id, idx);
  }

  const out = sorted.map((p, idx) => ({
    id: p.id,
    full_name: p.full_name,
    strength: p.strength,
    seed_team_index: p.seed_team_index ?? null,
    seed_slot: p.seed_slot ?? null,
    rank: idx + 1,
    bucket: bucketByPlayer.get(p.id)!,
    team_index: teamIndexByPlayer.get(p.id) ?? null,
    team_slot: teamSlotByPlayer.get(p.id) ?? null,
  }));

  return NextResponse.json({ ok: true, players: out });
}