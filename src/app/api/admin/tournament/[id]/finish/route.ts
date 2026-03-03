// src/app/api/admin/tournament/[id]/finish/route.ts
/*
Purpose: Finalize a tournament (mark it finished) only when the last match is fully scored.
Algorithm:

1. Require admin (`requireAdminOr401`).
2. Block if tournament canceled; if already finished -> `{ ok:true }`.
3. Fetch the latest stage by `number` desc. If no stages exist -> reject (“no match has started”).
4. Load all games for the latest stage and verify completeness: each game must have `winner_team_id`. If any missing -> reject (“not all results entered”).
5. Mark all games in the latest stage as `is_final:true` (used by the public showcase to highlight final match set).
6. Update tournament status to `"finished"`.
   Outcome: Tournament moves into a terminal “finished” state; final games are flagged for the public view.
   */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminOr401 } from "@/lib/adminAuth";
import { getTournamentFlags } from "@/lib/tournamentGuards";

export async function POST(_req: Request, context: any) {
  const { id } = await context.params;
  const tournamentId = id;

  if (!(await requireAdminOr401())) {
    return NextResponse.json({ ok: false, error: "NOT_ADMIN" }, { status: 401 });
  }

  const f = await getTournamentFlags(tournamentId);
  if (f.canceled) return NextResponse.json({ ok: false, error: "РўСѓСЂРЅРёСЂ РѕС‚РјРµРЅРµРЅ" }, { status: 400 });
  if (f.status === "finished") return NextResponse.json({ ok: true });

  const { data: lastStage } = await supabaseAdmin
    .from("stages")
    .select("id, number")
    .eq("tournament_id", tournamentId)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastStage?.id) {
    return NextResponse.json({ ok: false, error: "РќРё РѕРґРёРЅ РјР°С‚С‡ РµС‰Рµ РЅРµ РЅР°С‡Р°Р»СЃСЏ" }, { status: 400 });
  }

  const { data: lastGames } = await supabaseAdmin
    .from("games")
    .select("id, winner_team_id")
    .eq("stage_id", lastStage.id);

  const complete = (lastGames?.length ?? 0) > 0 && lastGames!.every((g) => !!g.winner_team_id);
  if (!complete) {
    return NextResponse.json({ ok: false, error: "РќРµ РІСЃРµ СЂРµР·СѓР»СЊС‚Р°С‚С‹ С‚РµРєСѓС‰РµРіРѕ РјР°С‚С‡Р° РІРЅРµСЃРµРЅС‹" }, { status: 400 });
  }

  // РїРѕРјРµС‚РёРј РёРіСЂС‹ РїРѕСЃР»РµРґРЅРµРіРѕ РјР°С‚С‡Р° РєР°Рє С„РёРЅР°Р»СЊРЅС‹Рµ (РґР»СЏ РІРёС‚СЂРёРЅС‹)
  await supabaseAdmin.from("games").update({ is_final: true }).eq("stage_id", lastStage.id);

  // Р·Р°РІРµСЂС€Р°РµРј С‚СѓСЂРЅРёСЂ
  await supabaseAdmin.from("tournaments").update({ status: "finished" }).eq("id", tournamentId);

  return NextResponse.json({ ok: true });
}
