// src/lib/payments.ts
/*
Purpose:
Payment-state helpers for tournament registrations.

Responsibilities:
1. Interpret `registration_payments` rows by mode:
   - SOLO: usually slot 1 only
   - TEAM: slots 1..3
2. Count paid slots for a registration.
3. Determine whether a registration is fully paid.
4. Enforce build/start guards using accepted registrations only.

Typical helper:
- assertAllAcceptedPaid(tournamentId)

assertAllAcceptedPaid algorithm:
1. Load accepted registrations for the tournament.
2. For each accepted registration:
   - SOLO: require slot 1 paid
   - TEAM: require slots 1, 2, 3 paid
3. If any accepted registration is incomplete:
   - throw / return an error usable by API routes
4. Otherwise allow build-teams / start flow to continue.

Important business rule:
- Only `accepted` registrations are relevant for the payment readiness guard.
- `reserve` and `reserve_pending` may have payment rows, but do not block tournament start.

Outcome:
Provides the payment-readiness logic required before building teams or starting matches.
*/

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