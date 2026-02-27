import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function assertAllAcceptedPaid(tournamentId: string) {
  const { data: regs, error: eR } = await supabaseAdmin
    .from("registrations")
    .select("id, mode, status")
    .eq("tournament_id", tournamentId)
    .eq("status", "accepted");

  if (eR) throw new Error("REGS_LOAD_FAILED");

  const accepted = regs ?? [];
  if (accepted.length === 0) return;

  const regIds = accepted.map(r => r.id);

  const { data: pays, error: eP } = await supabaseAdmin
    .from("registration_payments")
    .select("registration_id, slot, paid")
    .eq("tournament_id", tournamentId)
    .in("registration_id", regIds);

  if (eP) throw new Error("PAYS_LOAD_FAILED");

  const byReg = new Map<string, Map<number, boolean>>();
  for (const p of pays ?? []) {
    const m = byReg.get(p.registration_id) ?? new Map<number, boolean>();
    m.set(p.slot, !!p.paid);
    byReg.set(p.registration_id, m);
  }

  for (const r of accepted) {
    const m = byReg.get(r.id) ?? new Map<number, boolean>();
    if (r.mode === "SOLO") {
      if (!m.get(1)) throw new Error(`NOT_PAID:${r.id}`);
    } else {
      if (!m.get(1) || !m.get(2) || !m.get(3)) throw new Error(`NOT_PAID:${r.id}`);
    }
  }
}