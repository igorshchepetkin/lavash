// src/app/api/admin/tournament/[id]/solo-players/seed/route.ts
/*
Purpose:
Assign or clear manual seeding for a SOLO player before teams are built.

Algorithm:

1. Require authorized tournament manager access.
2. Reject if:
   - tournament canceled
   - tournament finished
   - first match already started
   - teams are already built and seeding is currently locked
3. Parse JSON body:
   - playerId
   - seed_team_index (1..8 or null)
4. Validate:
   - player belongs to this tournament
   - seed_team_index is null or within 1..8
   - no other player in the same tournament already owns this seed_team_index
5. Update `players.seed_team_index`.
6. Optionally clear or recompute `seed_slot` if that field is part of the current seeding model.
7. Return `{ ok:true }`.

Outcome:
Lets the judge lock selected players into target teams before automatic SOLO team generation.
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
    return NextResponse.json({ ok: false, error: "РќРµР»СЊР·СЏ РїРѕСЃРµСЏС‚СЊ Р±РѕР»РµРµ 8 РёРіСЂРѕРєРѕРІ" }, { status: 400 });
  }

  // update (db has unique index (tournament_id, seed_team_index) where not null)
  const { error: eU } = await supabaseAdmin
    .from("players")
    .update({
      seed_team_index,
      seed_slot: seed_team_index != null ? 1 : null, // slot РЅР°Рј РїРѕРєР° РЅРµ РЅСѓР¶РµРЅ, РЅРѕ РїСѓСЃС‚СЊ Р±СѓРґРµС‚ РІР°Р»РёРґРЅС‹Рј
    })
    .eq("id", playerId)
    .eq("tournament_id", tournamentId);

  if (eU) {
    // РѕР¶РёРґР°РµРјР°СЏ РѕС€РёР±РєР° вЂ” РєРѕРЅС„Р»РёРєС‚ СѓРЅРёРєР°Р»СЊРЅРѕРіРѕ РёРЅРґРµРєСЃР° (Р·Р°РЅСЏС‚Р° РєРѕРјР°РЅРґР°)
    return NextResponse.json({ ok: false, error: eU }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
