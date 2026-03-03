// src/app/api/tournaments/route.ts
/*
Purpose: Public tournaments list endpoint.
Algorithm: Select tournaments list fields from DB ordered by date desc; return `{ ok:true, tournaments:[...] }` or 400 on DB error.
Outcome: Minimal data source for public “choose tournament / upcoming events” view.
*/

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("tournaments")
    .select("id, name, date, start_time, registration_mode, status")
    .order("date", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
  return NextResponse.json({ ok: true, tournaments: data ?? [] });
}
