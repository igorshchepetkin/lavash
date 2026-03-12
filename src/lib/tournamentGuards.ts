// src/lib/tournamentGuards.ts
/*
Purpose:
Reusable tournament lifecycle guards and derived state helpers.

Responsibilities:
1. Load tournament lifecycle state.
2. Derive common boolean flags used across admin and public logic.
3. Prevent duplicated status checks in many route handlers/pages.

Typical helper:
- getTournamentFlags(tournamentId)

Expected derived flags:
- started
- canceled
- finished
- status
- possibly additional convenience flags depending on implementation

Common semantics:
- started = tournament.status !== "draft"
- canceled = tournament.status === "canceled"
- finished = tournament.status === "finished"

Usage examples:
- registrations page locks actions when started/canceled/finished
- settings page locks scoring edits after start
- ops page blocks invalid operations
- public pages decide whether apply button is visible

Design intent:
Encapsulate tournament lifecycle interpretation in one shared helper layer.

Outcome:
Provides stable, readable lifecycle guards for both routes and UI loaders.
*/

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