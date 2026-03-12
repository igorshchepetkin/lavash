// src/lib/reserve.ts
/*
Purpose:
Reserve-roster business logic helpers.

Responsibilities:
1. Determine main-roster capacity by tournament mode:
   - SOLO = 24
   - TEAM = 8
2. Decide whether an accepted registration should enter:
   - main roster (`accepted`)
   - reserve (`reserve`)
3. Promote the oldest reserve registration when a main slot opens.
4. Handle `reserve_pending` confirmation logic safely.

Core business rules:
- accepting within capacity -> `accepted`
- accepting above capacity -> `reserve`
- reserve registrations do not create players/teams until promotion
- when a main slot opens, oldest reserve becomes `reserve_pending`
- if confirmed while slot still free -> `accepted`
- if slot already filled -> back to `reserve`
- once tournament starts, promotion from reserve is no longer allowed

Typical helper responsibilities:
- getMainRosterCapacity(mode)
- recalcReserveAfterUnaccept(...)
- promoteOldestReserveIfPossible(...)
- confirmReservePromotion(...)

Design intent:
Keep reserve-specific state transitions out of route handlers so the rules remain
consistent across public and admin flows.

Outcome:
Provides a single source of truth for reserve capacity and promotion mechanics.
*/

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type RegistrationMode = "SOLO" | "TEAM";
export type RegistrationStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "withdrawn"
  | "canceled"
  | "reserve"
  | "reserve_pending";

export function limitForMode(mode: RegistrationMode): number {
  return mode === "SOLO" ? 24 : 8;
}

export async function getTournamentModeAndStatus(tournamentId: string): Promise<{ mode: RegistrationMode; status: string }> {
  const { data: t, error } = await supabaseAdmin
    .from("tournaments")
    .select("registration_mode, status")
    .eq("id", tournamentId)
    .single();

  if (error || !t) throw new Error("TOURNAMENT_NOT_FOUND");
  return { mode: t.registration_mode as RegistrationMode, status: t.status as string };
}

export async function coreAcceptedCount(tournamentId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId)
    .eq("status", "accepted");

  if (error) throw new Error("ACCEPTED_COUNT_FAILED");
  return Number(count ?? 0);
}

export async function hasReservePending(tournamentId: string): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId)
    .eq("status", "reserve_pending");

  if (error) throw new Error("RESERVE_PENDING_COUNT_FAILED");
  return Number(count ?? 0) > 0;
}

/**
 * Ensures reserve candidate state matches current tournament situation.
 *
 * Rules:
 * - Only in draft (before match 1) do we keep a single reserve_pending candidate.
 * - If core is full (accepted >= limit) -> any reserve_pending must be turned back into reserve.
 * - If core is not full AND there is no reserve_pending candidate -> earliest reserve becomes reserve_pending.
 */
export async function ensureReserveCandidate(tournamentId: string) {
  const { mode, status } = await getTournamentModeAndStatus(tournamentId);

  // After tournament start, all reserve_pending must be forced back to reserve.
  if (status !== "draft") {
    await supabaseAdmin
      .from("registrations")
      .update({ status: "reserve" })
      .eq("tournament_id", tournamentId)
      .eq("status", "reserve_pending");
    return;
  }

  const limit = limitForMode(mode);
  const accepted = await coreAcceptedCount(tournamentId);

  if (accepted >= limit) {
    await supabaseAdmin
      .from("registrations")
      .update({ status: "reserve" })
      .eq("tournament_id", tournamentId)
      .eq("status", "reserve_pending");
    return;
  }

  if (await hasReservePending(tournamentId)) return;

  // pick earliest reserve
  const { data: cand, error } = await supabaseAdmin
    .from("registrations")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("status", "reserve")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("RESERVE_PICK_FAILED");
  if (!cand?.id) return;

  await supabaseAdmin
    .from("registrations")
    .update({ status: "reserve_pending" })
    .eq("id", cand.id);
}

export async function createEntitiesForAcceptedRegistration(tournamentId: string, reg: any) {
  if (reg.mode === "SOLO") {
    const { error } = await supabaseAdmin.from("players").insert({
      tournament_id: tournamentId,
      full_name: reg.solo_player,
      strength: reg.strength ?? 3,
      registration_id: reg.id,
    });
    if (error) throw new Error("PLAYER_CREATE_FAILED");
    return;
  }

  const names = [reg.team_player1, reg.team_player2, reg.team_player3].filter(Boolean);
  if (names.length !== 3) throw new Error("TEAM_NEEDS_3_NAMES");

  const { data: insertedPlayers, error: e3 } = await supabaseAdmin
    .from("players")
    .insert(
      names.map((full_name: string) => ({
        tournament_id: tournamentId,
        full_name,
        strength: reg.strength ?? 3,
        registration_id: reg.id,
      }))
    )
    .select("id, full_name");

  if (e3 || !insertedPlayers) throw new Error("PLAYERS_CREATE_FAILED");

  const teamName = names.join(" / ");

  const { data: team, error: e4 } = await supabaseAdmin
    .from("teams")
    .insert({
      tournament_id: tournamentId,
      name: teamName,
      points: 0,
      registration_id: reg.id,
    })
    .select("id")
    .single();

  if (e4 || !team) throw new Error("TEAM_CREATE_FAILED");

  const memberRows = insertedPlayers.map((p: any, idx: number) => ({
    team_id: team.id,
    player_id: p.id,
    slot: idx + 1,
  }));

  const { error: e5 } = await supabaseAdmin.from("team_members").insert(memberRows);
  if (e5) throw new Error("TEAM_MEMBERS_CREATE_FAILED");
}

export async function rollbackAcceptedEntities(registrationId: string) {
  const { data: teams } = await supabaseAdmin.from("teams").select("id").eq("registration_id", registrationId);
  const teamIds = (teams ?? []).map((t: any) => t.id);

  if (teamIds.length) {
    await supabaseAdmin.from("team_members").delete().in("team_id", teamIds);
    await supabaseAdmin.from("teams").delete().in("id", teamIds);
  }

  await supabaseAdmin.from("players").delete().eq("registration_id", registrationId);
}

/**
 * Accepts a registration. If core is full -> marks as reserve and does NOT create players/teams.
 * Returns { status } that was set.
 */
export async function acceptWithReserve(tournamentId: string, registrationId: string): Promise<{ status: RegistrationStatus }> {
  const { mode, status: tStatus } = await getTournamentModeAndStatus(tournamentId);
  if (tStatus !== "draft") throw new Error("TOURNAMENT_NOT_DRAFT");

  const limit = limitForMode(mode);
  const accepted = await coreAcceptedCount(tournamentId);

  const { data: reg, error: e1 } = await supabaseAdmin.from("registrations").select("*").eq("id", registrationId).single();
  if (e1 || !reg) throw new Error("REG_NOT_FOUND");

  if (accepted >= limit) {
    const { error } = await supabaseAdmin.from("registrations").update({ status: "reserve" }).eq("id", registrationId);
    if (error) throw new Error("REG_UPDATE_FAILED");
    await ensureReserveCandidate(tournamentId);
    return { status: "reserve" };
  }

  const { error: e2 } = await supabaseAdmin.from("registrations").update({ status: "accepted" }).eq("id", registrationId);
  if (e2) throw new Error("REG_UPDATE_FAILED");

  await createEntitiesForAcceptedRegistration(tournamentId, reg);
  await ensureReserveCandidate(tournamentId);
  return { status: "accepted" };
}

/**
 * Unaccepts a registration:
 * - accepted -> rollback entities, status->pending
 * - reserve / reserve_pending -> status->pending
 */
export async function unacceptWithReserve(tournamentId: string, reg: any) {
  if (reg.status === "accepted") {
    await rollbackAcceptedEntities(reg.id);
  }

  const { error } = await supabaseAdmin.from("registrations").update({ status: "pending" }).eq("id", reg.id);
  if (error) throw new Error("REG_UPDATE_FAILED");

  await ensureReserveCandidate(tournamentId);
}

/**
 * Confirms promotion from reserve_pending to accepted.
 * - Only in draft.
 * - If core already full -> candidate returns to reserve.
 */
export async function confirmReservePromotion(tournamentId: string, registrationId: string): Promise<{ promoted: boolean; status: RegistrationStatus }> {
  const { mode, status: tStatus } = await getTournamentModeAndStatus(tournamentId);
  if (tStatus !== "draft") throw new Error("TOURNAMENT_NOT_DRAFT");

  const { data: reg, error: e1 } = await supabaseAdmin.from("registrations").select("*").eq("id", registrationId).single();
  if (e1 || !reg) throw new Error("REG_NOT_FOUND");

  if (reg.status !== "reserve_pending") throw new Error("NOT_RESERVE_PENDING");

  const limit = limitForMode(mode);
  const accepted = await coreAcceptedCount(tournamentId);

  if (accepted >= limit) {
    await supabaseAdmin.from("registrations").update({ status: "reserve" }).eq("id", registrationId);
    await ensureReserveCandidate(tournamentId);
    return { promoted: false, status: "reserve" };
  }

  await supabaseAdmin.from("registrations").update({ status: "accepted" }).eq("id", registrationId);
  await createEntitiesForAcceptedRegistration(tournamentId, reg);

  await ensureReserveCandidate(tournamentId);
  return { promoted: true, status: "accepted" };
}
