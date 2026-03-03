// src/app/api/admin/tournament/[id]/cancel/route.ts
/*
Purpose: Cancel a tournament and invalidate all registrations.
Algorithm:

1. Require admin (`requireAdminOr401`).
2. Load tournament status; if not found -> 404; if already canceled -> `{ ok:true }`.
3. Update tournament `status` to `"canceled"`.
4. Bulk update all `registrations` of this tournament to `status:"canceled"`.
   Outcome: Tournament is permanently marked canceled; registrations are also marked canceled for consistent downstream UI/state.
   */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminOr401 } from "@/lib/adminAuth";

export async function POST(
    _req: Request,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const tournamentId = id;

    if (!(await requireAdminOr401())) {
        return NextResponse.json({ ok: false, error: "NOT_ADMIN" }, { status: 401 });
    }

    // Р•СЃР»Рё СѓР¶Рµ РѕС‚РјРµРЅС‘РЅ/Р·Р°РІРµСЂС€С‘РЅ вЂ” РїСЂРѕСЃС‚Рѕ СЃРѕРѕР±С‰РёРј
    const { data: t } = await supabaseAdmin
        .from("tournaments")
        .select("status")
        .eq("id", tournamentId)
        .single();

    if (!t) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (t.status === "canceled") return NextResponse.json({ ok: true });

    // 1) РўСѓСЂРЅРёСЂ РѕС‚РјРµРЅС‘РЅ
    await supabaseAdmin.from("tournaments").update({ status: "canceled" }).eq("id", tournamentId);

    // 2) Р’СЃРµ Р·Р°СЏРІРєРё СЃС‡РёС‚Р°РµРј РѕС‚РјРµРЅС‘РЅРЅС‹РјРё
    await supabaseAdmin
        .from("registrations")
        .update({ status: "canceled" })
        .eq("tournament_id", tournamentId);

    return NextResponse.json({ ok: true });
}
