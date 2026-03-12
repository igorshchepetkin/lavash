// src/app/api/admin/tournaments/route.ts
/*
Purpose:
List active tournaments for the admin homepage and create new tournaments.

GET algorithm:

1. Require authenticated admin session.
2. Determine visible tournaments by role:
   - ADMIN: all non-archived tournaments
   - CHIEF_JUDGE: tournaments where user is chief judge
   - JUDGE: tournaments where user is assigned via `tournament_judges`
3. Exclude archived tournaments from the active list.
4. Return tournament cards with fields needed by UI:
   - id
   - name
   - date
   - start_time
   - registration_mode
   - status
   - chief_judge_user_id
   - chief_judge_name

POST algorithm:

1. Require allowed creator role (`ADMIN` or `CHIEF_JUDGE` according to current business rules).
2. Parse JSON body:
   - name
   - date
   - start_time
   - registration_mode
   - points_c1..c4
   - chief_judge_user_id
   - judge_ids (optional)
   - overrides (optional)
3. Validate:
   - chief judge is mandatory
   - selected chief judge is active and has role `CHIEF_JUDGE`
   - if current user is CHIEF_JUDGE, chief judge is fixed to self
4. Insert tournament in status `draft`.
5. Insert optional `tournament_judges`.
6. Insert optional `tournament_points_overrides`.
7. Return `{ ok:true, tournament }`.

Outcome:
Drives the main admin tournament list and tournament creation workflow.
*/

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  canCreateTournament,
  listAccessibleTournaments,
  requireAnyAdminUserOr401,
  runAdminHousekeeping,
} from "@/lib/adminAccess";
import { sessionJson, unauthorized } from "@/lib/adminApi";
import { hasRole } from "@/lib/adminSecurity";

async function getChiefJudgeNameMap(userIds: string[]) {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return new Map<string, string>();

  const { data } = await supabaseAdmin
    .from("admin_users")
    .select("id, first_name, last_name")
    .in("id", ids);

  const map = new Map<string, string>();
  for (const u of data ?? []) {
    map.set(u.id, `${u.last_name} ${u.first_name}`.trim());
  }
  return map;
}

async function validateChiefJudge(chiefJudgeUserId: string | null) {
  if (!chiefJudgeUserId) {
    return { ok: false, error: "Главный судья обязателен." };
  }

  const { data: user } = await supabaseAdmin
    .from("admin_users")
    .select("id, is_active, roles, first_name, last_name")
    .eq("id", chiefJudgeUserId)
    .maybeSingle();

  if (!user?.id) {
    return { ok: false, error: "Указанный главный судья не найден." };
  }
  if (!user.is_active) {
    return { ok: false, error: "Главный судья должен быть активным пользователем." };
  }
  if (!Array.isArray(user.roles) || !user.roles.includes("CHIEF_JUDGE")) {
    return { ok: false, error: "Указанный пользователь не имеет роли Главный судья." };
  }

  return { ok: true };
}

async function validateJudges(judgeIds: string[]) {
  if (judgeIds.length === 0) return { ok: true };

  const ids = Array.from(new Set(judgeIds));
  const { data: users } = await supabaseAdmin
    .from("admin_users")
    .select("id, is_active, roles")
    .in("id", ids);

  const validIds = new Set(
    (users ?? [])
      .filter((u) => u.is_active && Array.isArray(u.roles) && u.roles.includes("JUDGE"))
      .map((u) => u.id)
  );

  if (validIds.size !== ids.length) {
    return { ok: false, error: "Список судей содержит неактивных или неподходящих пользователей." };
  }

  return { ok: true };
}

function normalizeOverrides(raw: any[], tournamentId: string) {
  return raw
    .map((o) => ({
      tournament_id: tournamentId,
      stage_number: Number(o.stage_number),
      points_c1: Number(o.points_c1),
      points_c2: Number(o.points_c2),
      points_c3: Number(o.points_c3),
      points_c4: Number(o.points_c4),
    }))
    .filter(
      (o) =>
        Number.isFinite(o.stage_number) &&
        o.stage_number >= 1 &&
        [o.points_c1, o.points_c2, o.points_c3, o.points_c4].every((x) => Number.isFinite(x))
    );
}

export async function GET(req: Request) {
  await runAdminHousekeeping();

  const ctx = await requireAnyAdminUserOr401();
  if (!ctx) return unauthorized();

  const url = new URL(req.url);
  const archived = url.searchParams.get("archived") === "1";
  const tournaments = await listAccessibleTournaments(ctx, archived);

  const chiefJudgeMap = await getChiefJudgeNameMap(
    tournaments.map((t: any) => t.chief_judge_user_id).filter(Boolean)
  );

  const enriched = tournaments.map((t: any) => ({
    ...t,
    chief_judge_name: t.chief_judge_user_id ? chiefJudgeMap.get(t.chief_judge_user_id) ?? null : null,
  }));

  return sessionJson(ctx, { ok: true, tournaments: enriched });
}

export async function POST(req: Request) {
  const ctx = await requireAnyAdminUserOr401();
  if (!ctx) return unauthorized();

  if (!(await canCreateTournament(ctx))) {
    return sessionJson(ctx, { ok: false, error: "FORBIDDEN" }, 403);
  }

  const body = await req.json().catch(() => ({}));

  const name = String(body?.name ?? "").trim();
  const date = String(body?.date ?? "").trim();
  const start_time = body?.start_time ? String(body.start_time) : null;
  const registration_mode = body?.registration_mode === "TEAM" ? "TEAM" : "SOLO";

  const points_c1 = Number(body?.points_c1 ?? 5);
  const points_c2 = Number(body?.points_c2 ?? 4);
  const points_c3 = Number(body?.points_c3 ?? 3);
  const points_c4 = Number(body?.points_c4 ?? 2);

  const chiefJudgeUserId = hasRole(ctx.user.roles, "ADMIN")
    ? (body?.chief_judge_user_id ? String(body.chief_judge_user_id) : null)
    : ctx.user.id;

  const judgeIds = Array.isArray(body?.judge_ids) ? body.judge_ids.map(String) : [];
  const overridesRaw = Array.isArray(body?.overrides) ? body.overrides : [];

  if (!name) {
    return sessionJson(ctx, { ok: false, error: "Название турнира обязательно." }, 400);
  }
  if (!date) {
    return sessionJson(ctx, { ok: false, error: "Дата турнира обязательна." }, 400);
  }

  const chiefJudgeCheck = await validateChiefJudge(chiefJudgeUserId);
  if (!chiefJudgeCheck.ok) {
    return sessionJson(ctx, { ok: false, error: chiefJudgeCheck.error }, 400);
  }

  const judgesCheck = await validateJudges(judgeIds);
  if (!judgesCheck.ok) {
    return sessionJson(ctx, { ok: false, error: judgesCheck.error }, 400);
  }

  const { data, error } = await supabaseAdmin
    .from("tournaments")
    .insert({
      name,
      date,
      start_time,
      registration_mode,
      points_c1,
      points_c2,
      points_c3,
      points_c4,
      chief_judge_user_id: chiefJudgeUserId,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return sessionJson(ctx, { ok: false, error: error ?? "CREATE_FAILED" }, 400);
  }

  const overrides = normalizeOverrides(overridesRaw, data.id);
  if (overrides.length) {
    const { error: eOv } = await supabaseAdmin
      .from("tournament_points_overrides")
      .insert(overrides);

    if (eOv) {
      return sessionJson(ctx, { ok: false, error: eOv }, 400);
    }
  }

  if (judgeIds.length) {
    const rows = Array.from(new Set(judgeIds)).map((user_id) => ({
      tournament_id: data.id,
      user_id,
      created_by: ctx.user.id,
    }));

    const { error: eJ } = await supabaseAdmin
      .from("tournament_judges")
      .insert(rows);

    if (eJ) {
      return sessionJson(ctx, { ok: false, error: eJ }, 400);
    }
  }

  return sessionJson(ctx, { ok: true, id: data.id });
}