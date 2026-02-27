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
  if (f.canceled) return NextResponse.json({ ok: false, error: "Турнир отменен" }, { status: 400 });
  if (f.status === "finished") return NextResponse.json({ ok: true });

  const { data: lastStage } = await supabaseAdmin
    .from("stages")
    .select("id, number")
    .eq("tournament_id", tournamentId)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastStage?.id) {
    return NextResponse.json({ ok: false, error: "Ни один матч еще не начался" }, { status: 400 });
  }

  const { data: lastGames } = await supabaseAdmin
    .from("games")
    .select("id, winner_team_id")
    .eq("stage_id", lastStage.id);

  const complete = (lastGames?.length ?? 0) > 0 && lastGames!.every((g) => !!g.winner_team_id);
  if (!complete) {
    return NextResponse.json({ ok: false, error: "Не все результаты текущего матча внесены" }, { status: 400 });
  }

  // пометим игры последнего матча как финальные (для витрины)
  await supabaseAdmin.from("games").update({ is_final: true }).eq("stage_id", lastStage.id);

  // завершаем турнир
  await supabaseAdmin.from("tournaments").update({ status: "finished" }).eq("id", tournamentId);

  return NextResponse.json({ ok: true });
}