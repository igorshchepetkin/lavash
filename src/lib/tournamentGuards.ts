import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function getTournamentFlags(tournamentId: string) {
  const { data: t } = await supabaseAdmin
    .from("tournaments")
    .select("status")
    .eq("id", tournamentId)
    .single();

  const status = (t?.status ?? "draft") as "draft" | "live" | "finished" | "canceled";
  const canceled = status === "canceled";
  const started = status !== "draft"; // live/finished/canceled => старт уже не “приём заявок”
  return { status, started, canceled };
}