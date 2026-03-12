// src/app/api/admin/tournament/[id]/finish/route.ts
/*
Purpose:
Finish a tournament after the last current stage is fully completed.

Algorithm:

1. Require authorized tournament manager access.
2. Load tournament and latest stage.
3. Reject if:
   - tournament is canceled
   - tournament is already finished
   - no started stage exists when business rules require at least one stage
4. Load games of the latest stage.
5. Require every game in the latest stage to have a winner.
6. Optionally mark latest-stage games with `is_final=true`.
7. Update `tournaments.status='finished'`.
8. Return `{ ok:true }`.

Outcome:
Closes the tournament lifecycle and prevents starting new stages or editing competitive state further.
*/

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireTournamentManagerOr401 } from "@/lib/adminAccess";
import { sessionJson, unauthorized } from "@/lib/adminApi";
import { getTournamentFlags } from "@/lib/tournamentGuards";

export async function POST(_req: Request, context: any) {
  const { id } = await context.params;
  const tournamentId = id;

  const ctx = await requireTournamentManagerOr401(tournamentId);
    if (!ctx) {
    return unauthorized()
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
