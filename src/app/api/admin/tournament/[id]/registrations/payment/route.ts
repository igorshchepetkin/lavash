import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminOr401 } from "@/lib/adminAuth";
import { getTournamentFlags } from "@/lib/tournamentGuards";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await requireAdminOr401())) {
    return NextResponse.json({ ok: false, error: "NOT_ADMIN" }, { status: 401 });
  }

  const { id } = await context.params;
  const tournamentId = id;

  const f = await getTournamentFlags(tournamentId);
  if (f.canceled) return NextResponse.json({ ok: false, error: "Tournament canceled" }, { status: 400 });
  if (f.started)  return NextResponse.json({ ok: false, error: "Tournament already started" }, { status: 400 });

  const { registrationId, slot, paid } = await req.json();
  const s = Number(slot);
  if (!registrationId || !Number.isFinite(s) || s < 1 || s > 3) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const { data: reg } = await supabaseAdmin
    .from("registrations")
    .select("id, tournament_id, mode, status")
    .eq("id", registrationId)
    .eq("tournament_id", tournamentId)
    .single();

  if (!reg) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // как ты хотел: подтверждать оплату можно только для accepted
  if (reg.status !== "accepted") {
    return NextResponse.json({ ok: false, error: "Payment allowed only for accepted registrations" }, { status: 400 });
  }

  if (reg.mode === "SOLO" && s !== 1) {
    return NextResponse.json({ ok: false, error: "SOLO supports only slot=1" }, { status: 400 });
  }

  const paidBool = !!paid;

  const { error } = await supabaseAdmin
    .from("registration_payments")
    .upsert(
      {
        tournament_id: tournamentId,
        registration_id: registrationId,
        slot: s,
        paid: paidBool,
        paid_at: paidBool ? new Date().toISOString() : null,
      },
      { onConflict: "registration_id,slot" }
    );

  if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
  return NextResponse.json({ ok: true });
}