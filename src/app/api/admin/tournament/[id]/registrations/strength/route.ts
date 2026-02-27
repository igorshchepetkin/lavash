import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminOr401 } from "@/lib/adminAuth";
import { getTournamentFlags } from "@/lib/tournamentGuards";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdminOr401())) {
    return NextResponse.json({ ok: false, error: "NOT_ADMIN" }, { status: 401 });
  }

  const { id } = await context.params;
  const tournamentId = id;

  const f = await getTournamentFlags(tournamentId);
  if (f.canceled) return NextResponse.json({ ok: false, error: "Tournament canceled" }, { status: 400 });
  if (f.started) return NextResponse.json({ ok: false, error: "Tournament already started" }, { status: 400 });

  const { registrationId, strength } = await req.json();
  const s = Math.max(1, Math.min(5, Number(strength)));

  const { data: reg } = await supabaseAdmin
    .from("registrations")
    .select("id, mode")
    .eq("id", registrationId)
    .eq("tournament_id", tournamentId)
    .single();

  if (!reg) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // теперь разрешаем и TEAM, и SOLO
  const { error } = await supabaseAdmin
    .from("registrations")
    .update({ strength: s })
    .eq("id", registrationId);

  if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
  return NextResponse.json({ ok: true });
}