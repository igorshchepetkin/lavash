import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
    _req: Request,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;

    const { data: t, error } = await supabaseAdmin
        .from("tournaments")
        .select("registration_mode")
        .eq("id", id)
        .single();

    if (error || !t) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, registration_mode: t.registration_mode });
}