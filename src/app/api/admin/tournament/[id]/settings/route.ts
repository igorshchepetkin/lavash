// src/app/api/admin/tournament/[id]/settings/route.ts
/*
Purpose:
Read and update tournament-level settings after creation.

GET algorithm:

1. Require user who is allowed to manage this tournament
   (`ADMIN` or responsible `CHIEF_JUDGE`).
2. Load tournament core fields:
   - name
   - date
   - start_time
   - registration_mode
   - status
   - chief_judge_user_id
   - points_c1..c4
3. Load:
   - current judges from `tournament_judges`
   - available chief-judge options
   - available judge options
   - points overrides
   - tournament flags (started / canceled / finished)
4. Return a settings payload for the UI.

POST algorithm:

1. Require tournament manager access.
2. Parse JSON body:
   - date
   - start_time
   - chief_judge_user_id
   - judge_ids[]
   - points_c1..c4
   - overrides[]
3. Validate:
   - chief judge is mandatory
   - only ADMIN may replace chief judge
   - date cannot be moved into the past
   - date/time/points/overrides may be changed only before tournament start
4. Update tournament row.
5. Replace `tournament_judges`.
6. Replace `tournament_points_overrides` if still editable.
7. Return `{ ok:true }`.

Outcome:
Backs the tournament settings page for schedule, judges, chief judge, and scoring rules.
*/

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireTournamentManagerOr401 } from "@/lib/adminAccess";
import { sessionJson, unauthorized } from "@/lib/adminApi";
import { getTournamentFlags } from "@/lib/tournamentGuards";

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

function isPastDate(date: string) {
  const today = new Date().toISOString().slice(0, 10);
  return date < today;
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const ctx = await requireTournamentManagerOr401(id);
  if (!ctx) return unauthorized();

  const { data: tournament } = await supabaseAdmin
    .from("tournaments")
    .select(
      "id, name, date, start_time, registration_mode, status, chief_judge_user_id, points_c1, points_c2, points_c3, points_c4"
    )
    .eq("id", id)
    .single();

  const { data: judges } = await supabaseAdmin
    .from("tournament_judges")
    .select("user_id, admin_users!inner(id, first_name, last_name, login)")
    .eq("tournament_id", id);

  const { data: chiefJudgeOptions } = await supabaseAdmin
    .from("admin_users")
    .select("id, first_name, last_name, login, roles")
    .eq("is_active", true)
    .contains("roles", ["CHIEF_JUDGE"])
    .order("last_name", { ascending: true });

  const { data: judgeOptions } = await supabaseAdmin
    .from("admin_users")
    .select("id, first_name, last_name, login, roles")
    .eq("is_active", true)
    .contains("roles", ["JUDGE"])
    .order("last_name", { ascending: true });

  const { data: overrides } = await supabaseAdmin
    .from("tournament_points_overrides")
    .select("stage_number, points_c1, points_c2, points_c3, points_c4")
    .eq("tournament_id", id)
    .order("stage_number", { ascending: true });

  let currentChiefJudgeName = "—";
  if (tournament?.chief_judge_user_id) {
    const { data: chief } = await supabaseAdmin
      .from("admin_users")
      .select("first_name, last_name")
      .eq("id", tournament.chief_judge_user_id)
      .maybeSingle();

    if (chief) {
      currentChiefJudgeName = `${chief.last_name} ${chief.first_name}`.trim();
    }
  }

  const flags = await getTournamentFlags(id);

  return sessionJson(ctx, {
    ok: true,
    tournament,
    judges: (judges ?? []).map((row: any) =>
      Array.isArray(row.admin_users) ? row.admin_users[0] : row.admin_users
    ),
    chiefJudgeOptions: chiefJudgeOptions ?? [],
    judgeOptions: judgeOptions ?? [],
    currentChiefJudgeName,
    overrides: overrides ?? [],
    flags,
  });
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const ctx = await requireTournamentManagerOr401(id);
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const flags = await getTournamentFlags(id);

  const judgeIds = Array.isArray(body?.judge_ids) ? body.judge_ids.map(String) : [];
  const requestedChiefJudgeUserId = body?.chief_judge_user_id
    ? String(body.chief_judge_user_id)
    : null;

  const currentTournamentRes = await supabaseAdmin
    .from("tournaments")
    .select("chief_judge_user_id")
    .eq("id", id)
    .single();

  const currentChiefJudgeUserId = currentTournamentRes.data?.chief_judge_user_id ?? null;

  const chiefJudgeUserId = ctx.user.roles.includes("ADMIN")
    ? requestedChiefJudgeUserId
    : currentChiefJudgeUserId;

  const chiefJudgeCheck = await validateChiefJudge(chiefJudgeUserId);
  if (!chiefJudgeCheck.ok) {
    return sessionJson(ctx, { ok: false, error: chiefJudgeCheck.error }, 400);
  }

  const judgesCheck = await validateJudges(judgeIds);
  if (!judgesCheck.ok) {
    return sessionJson(ctx, { ok: false, error: judgesCheck.error }, 400);
  }

  if (!ctx.user.roles.includes("ADMIN") && requestedChiefJudgeUserId && requestedChiefJudgeUserId !== currentChiefJudgeUserId) {
    return sessionJson(
      ctx,
      { ok: false, error: "Менять главного судью может только администратор." },
      403
    );
  }

  if (flags.started) {
    if (body?.date || body?.start_time || body?.points_c1 !== undefined || Array.isArray(body?.overrides)) {
      return sessionJson(
        ctx,
        { ok: false, error: "Дата, время, очки на кортах и особые очки доступны только до начала турнира." },
        400
      );
    }
  }

  const updatePayload: Record<string, any> = {
    chief_judge_user_id: chiefJudgeUserId,
  };

  if (!flags.started) {
    const date = String(body?.date ?? "").trim();
    const start_time = String(body?.start_time ?? "").trim();

    if (!date) {
      return sessionJson(ctx, { ok: false, error: "Дата турнира обязательна." }, 400);
    }
    if (isPastDate(date)) {
      return sessionJson(ctx, { ok: false, error: "Дату турнира нельзя поставить в прошлое." }, 400);
    }

    updatePayload.date = date;
    updatePayload.start_time = start_time || null;
    updatePayload.points_c1 = Number(body?.points_c1 ?? 3);
    updatePayload.points_c2 = Number(body?.points_c2 ?? 2);
    updatePayload.points_c3 = Number(body?.points_c3 ?? 2);
    updatePayload.points_c4 = Number(body?.points_c4 ?? 1);
  }

  const { error: eTournament } = await supabaseAdmin
    .from("tournaments")
    .update(updatePayload)
    .eq("id", id);

  if (eTournament) {
    return sessionJson(ctx, { ok: false, error: eTournament }, 400);
  }

  const { error: eDelJudges } = await supabaseAdmin
    .from("tournament_judges")
    .delete()
    .eq("tournament_id", id);

  if (eDelJudges) {
    return sessionJson(ctx, { ok: false, error: eDelJudges }, 400);
  }

  if (judgeIds.length) {
    const rows = Array.from(new Set(judgeIds)).map((userId) => ({
      tournament_id: id,
      user_id: userId,
      created_by: ctx.user.id,
    }));

    const { error: eInsJudges } = await supabaseAdmin
      .from("tournament_judges")
      .insert(rows);

    if (eInsJudges) {
      return sessionJson(ctx, { ok: false, error: eInsJudges }, 400);
    }
  }

  if (!flags.started) {
    const overridesRaw = Array.isArray(body?.overrides) ? body.overrides : [];
    const overrides = normalizeOverrides(overridesRaw, id);

    const { error: eDelOverrides } = await supabaseAdmin
      .from("tournament_points_overrides")
      .delete()
      .eq("tournament_id", id);

    if (eDelOverrides) {
      return sessionJson(ctx, { ok: false, error: eDelOverrides }, 400);
    }

    if (overrides.length) {
      const { error: eInsOverrides } = await supabaseAdmin
        .from("tournament_points_overrides")
        .insert(overrides);

      if (eInsOverrides) {
        return sessionJson(ctx, { ok: false, error: eInsOverrides }, 400);
      }
    }
  }

  return sessionJson(ctx, { ok: true });
}