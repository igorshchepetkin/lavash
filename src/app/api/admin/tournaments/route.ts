// src/app/api/admin/tournaments/route.ts
/*
Purpose: Admin CRUD-lite for tournaments (list + create), including optional insertion of points overrides.
GET algorithm:

1. Require admin.
2. Select tournament list fields and order by date desc.
3. Return `{ ok:true, tournaments:[...] }`.
   POST algorithm (create tournament):
4. Require admin.
5. Parse tournament fields: name/date/start_time/registration_mode and optional base points (points_c1..c4 with defaults).
6. Insert tournament with status `"draft"` and return created id.
7. Optional overrides: if body contains `overrides[]`, normalize numeric rows (stage_number>=1, finite points) and insert them into `tournament_points_overrides` linked to the new tournament id.
   Outcome: Creates a tournament ready for registration/ops flows, with configurable scoring rules per court and per stage.
   */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminOr401 } from "@/lib/adminAuth";

export async function GET() {
    if (!(await requireAdminOr401())) {
        return NextResponse.json({ ok: false, error: "NOT_ADMIN" }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
        .from("tournaments")
        .select("id, name, date, start_time, registration_mode, status")
        .order("date", { ascending: false });

    if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
    return NextResponse.json({ ok: true, tournaments: data ?? [] });
}

export async function POST(req: Request) {
    if (!(await requireAdminOr401())) {
        return NextResponse.json({ ok: false, error: "NOT_ADMIN" }, { status: 401 });
    }

    const body = await req.json();
    const { name, date, start_time, registration_mode, points_c1, points_c2, points_c3, points_c4 } = body;

    const { data, error } = await supabaseAdmin
        .from("tournaments")
        .insert({
            name,
            date,
            start_time: start_time ?? null,
            registration_mode,
            points_c1: points_c1 ?? 5,
            points_c2: points_c2 ?? 4,
            points_c3: points_c3 ?? 3,
            points_c4: points_c4 ?? 2,
            status: "draft",
        })
        .select("id")
        .single();

    if (error) return NextResponse.json({ ok: false, error }, { status: 400 });

    // ===== Points overrides (optional) =====
    const overridesRaw = Array.isArray(body?.overrides) ? body.overrides : [];
    const overrides = overridesRaw
        .map((o: any) => ({
            tournament_id: data!.id,
            stage_number: Number(o.stage_number),
            points_c1: Number(o.points_c1),
            points_c2: Number(o.points_c2),
            points_c3: Number(o.points_c3),
            points_c4: Number(o.points_c4),
        }))
        .filter((o: any) =>
            Number.isFinite(o.stage_number) &&
            o.stage_number >= 1 &&
            [o.points_c1, o.points_c2, o.points_c3, o.points_c4].every((x: any) => Number.isFinite(x))
        );

    if (overrides.length) {
        const { error: eOv } = await supabaseAdmin
            .from("tournament_points_overrides")
            .insert(overrides);

        if (eOv) return NextResponse.json({ ok: false, error: eOv }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: data!.id });
}
