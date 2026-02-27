import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTournamentFlags } from "@/lib/tournamentGuards";

function makeCode(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const tournamentId = id;

  const f = await getTournamentFlags(tournamentId);
  if (f.canceled) return NextResponse.json({ ok: false, error: "Tournament canceled" }, { status: 400 });
  if (f.started) return NextResponse.json({ ok: false, error: "Tournament already started" }, { status: 400 });

  const body = await req.json();

  // determine tournament mode (TEAM/SOLO)
  const { data: t } = await supabaseAdmin
    .from("tournaments")
    .select("registration_mode")
    .eq("id", tournamentId)
    .single();

  if (!t) return NextResponse.json({ ok: false, error: "Tournament not found" }, { status: 404 });

  const cancel_code = makeCode(10);

  if (t.registration_mode === "SOLO") {
    const fullName = String(body.solo_player ?? "").trim();
    const strength = Number(body.strength ?? 3);

    if (!fullName) return NextResponse.json({ ok: false, error: "Name required" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("registrations")
      .insert({
        tournament_id: tournamentId,
        mode: "SOLO",
        solo_player: fullName,
        strength: Math.min(5, Math.max(1, strength)),
        status: "pending",
        cancel_code,
      })
      .select("id, cancel_code")
      .single();

    if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
    return NextResponse.json({ ok: true, registration_id: data!.id, cancel_code: data!.cancel_code });
  }

  // TEAM
  const p1 = String(body.team_player1 ?? "").trim();
  const p2 = String(body.team_player2 ?? "").trim();
  const p3 = String(body.team_player3 ?? "").trim();

  if (!p1 || !p2 || !p3) {
    return NextResponse.json({ ok: false, error: "Need 3 names" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("registrations")
    .insert({
      tournament_id: tournamentId,
      mode: "TEAM",
      team_player1: p1,
      team_player2: p2,
      team_player3: p3,
      status: "pending",
      cancel_code,
    })
    .select("id, cancel_code")
    .single();

  if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
  return NextResponse.json({ ok: true, registration_id: data!.id, cancel_code: data!.cancel_code });
}