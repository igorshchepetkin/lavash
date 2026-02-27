import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTournamentFlags } from "@/lib/tournamentGuards";

function makeCode(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function normPhone(x: any) {
  const s = String(x ?? "").trim();
  return s;
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const tournamentId = id;

  const f = await getTournamentFlags(tournamentId);
  if (f.canceled) return NextResponse.json({ ok: false, error: "Tournament canceled" }, { status: 400 });
  if (f.started) return NextResponse.json({ ok: false, error: "Tournament already started" }, { status: 400 });

  const { data: t, error: eT } = await supabaseAdmin
    .from("tournaments")
    .select("registration_mode")
    .eq("id", tournamentId)
    .single();

  if (eT || !t) return NextResponse.json({ ok: false, error: "Tournament not found" }, { status: 404 });

  const body = await req.json();
  const confirmation_code = makeCode(10);

  if (t.registration_mode === "SOLO") {
    const last = String(body.solo_last_name ?? "").trim();
    const first = String(body.solo_first_name ?? "").trim();
    const phone = normPhone(body.phone);

    if (!last || !first) return NextResponse.json({ ok: false, error: "Last and first name required" }, { status: 400 });
    if (!phone || !phone.startsWith("+")) return NextResponse.json({ ok: false, error: "Phone must start with +" }, { status: 400 });

    const full = `${last} ${first}`.trim();

    const { data, error } = await supabaseAdmin
      .from("registrations")
      .insert({
        tournament_id: tournamentId,
        mode: "SOLO",
        solo_last_name: last,
        solo_first_name: first,
        solo_player: full, // удобное ФИО для списка
        phone,
        strength: 3, // судья поменяет до посева
        status: "pending",
        confirmation_code,
      })
      .select("id, confirmation_code")
      .single();

    if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
    return NextResponse.json({ ok: true, registration_id: data!.id, confirmation_code: data!.confirmation_code });
  }

  // TEAM
  const p1 = String(body.team_player1 ?? "").trim();
  const p2 = String(body.team_player2 ?? "").trim();
  const p3 = String(body.team_player3 ?? "").trim();
  const phone = normPhone(body.phone);

  if (!p1 || !p2 || !p3) return NextResponse.json({ ok: false, error: "Need 3 names" }, { status: 400 });
  if (!phone || !phone.startsWith("+")) return NextResponse.json({ ok: false, error: "Phone must start with +" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("registrations")
    .insert({
      tournament_id: tournamentId,
      mode: "TEAM",
      team_player1: p1,
      team_player2: p2,
      team_player3: p3,
      phone, // телефон заявителя команды
      status: "pending",
      confirmation_code,
    })
    .select("id, confirmation_code")
    .single();

  if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
  return NextResponse.json({ ok: true, registration_id: data!.id, confirmation_code: data!.confirmation_code });
}