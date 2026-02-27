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

    // Если уже отменён/завершён — просто сообщим
    const { data: t } = await supabaseAdmin
        .from("tournaments")
        .select("status")
        .eq("id", tournamentId)
        .single();

    if (!t) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (t.status === "canceled") return NextResponse.json({ ok: true });

    // 1) Турнир отменён
    await supabaseAdmin.from("tournaments").update({ status: "canceled" }).eq("id", tournamentId);

    // 2) Все заявки считаем отменёнными
    await supabaseAdmin
        .from("registrations")
        .update({ status: "canceled" })
        .eq("tournament_id", tournamentId);

    return NextResponse.json({ ok: true });
}