// src/app/admin/t/[id]/settings/page.tsx
/*
Purpose:
Tournament settings page for editable pre-start configuration.

Page layout:
Section 1 — Tournament header
- tournament name
- current section context
- tournament info card:
  - date / time
  - mode badge
  - status badge
  - chief judge
- top-right buttons: ← Турниры / Обновить
- tournament tabs

Section 2 — Schedule and judge assignment
- date + start time
- chief judge
- tournament judges checklist

Section 3 — Court base points
- points_c1..c4 with court labels

Section 4 — Match-specific overrides
- stage-specific scoring overrides
- add / edit / remove rows

Main responsibilities:
1. Load the editable tournament settings payload.
2. Show current tournament metadata in the same visual language as other tournament pages.
3. Allow pre-start edits only where business rules permit.
4. Restrict chief judge reassignment to ADMIN.
5. Allow chief judge / admin to manage additional judges.
6. Keep point configuration centralized here after creation.

Guards:
- date cannot be set in the past
- chief judge is mandatory
- base points and overrides editable only before tournament start
- only allowed roles may modify settings

Design intent:
This page is configuration-oriented, so actions are grouped into clear white cards
with a strong visual distinction between metadata, permissions, and scoring rules.

Outcome:
Provides the structured pre-start configuration surface for schedule, staffing, and scoring.
*/

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import TournamentTabs from "@/components/TournamentTabs";
import { adminFetch } from "@/lib/adminClient";


type OverrideRow = {
  stage_number: number;
  points_c1: number;
  points_c2: number;
  points_c3: number;
  points_c4: number;
};

function statusBadge(status: string) {
  switch (status) {
    case "draft":
      return {
        text: "Приём заявок",
        style: {
          backgroundColor: "#FFEDD5",
          color: "#C2410C",
          borderColor: "#FED7AA",
        },
      };
    case "live":
      return {
        text: "Идёт",
        style: {
          backgroundColor: "#E0F2FE",
          color: "#0369A1",
          borderColor: "#BAE6FD",
        },
      };
    case "finished":
      return {
        text: "Завершён",
        style: {
          backgroundColor: "#D1FAE5",
          color: "#047857",
          borderColor: "#A7F3D0",
        },
      };
    case "canceled":
      return {
        text: "Отменён",
        style: {
          backgroundColor: "#E2E8F0",
          color: "#475569",
          borderColor: "#CBD5E1",
        },
      };
    default:
      return {
        text: status,
        style: {
          backgroundColor: "#F1F5F9",
          color: "#475569",
          borderColor: "#E2E8F0",
        },
      };
  }
}

function modeBadge(mode: "TEAM" | "SOLO") {
  if (mode === "SOLO") {
    return {
      text: "SOLO",
      style: {
        backgroundColor: "#F5F3FF",
        color: "#6D28D9",
        borderColor: "#DDD6FE",
      },
    };
  }

  return {
    text: "TEAM",
    style: {
      backgroundColor: "#FFF7ED",
      color: "#C2410C",
      borderColor: "#FED7AA",
    },
  };
}

function emptyOverrideRow(points: { p1: number; p2: number; p3: number; p4: number }): OverrideRow {
  return {
    stage_number: 1,
    points_c1: points.p1,
    points_c2: points.p2,
    points_c3: points.p3,
    points_c4: points.p4,
  };
}

export default function TournamentSettingsPage() {
  const params = useParams<{ id: string }>();
  const tournamentId = params.id;

  const [data, setData] = useState<any>(null);
  const [me, setMe] = useState<any>(null);

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [chiefJudgeUserId, setChiefJudgeUserId] = useState("");
  const [judgeIds, setJudgeIds] = useState<string[]>([]);

  const [p1, setP1] = useState(3);
  const [p2, setP2] = useState(2);
  const [p3, setP3] = useState(2);
  const [p4, setP4] = useState(1);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  async function load() {
    const [res, meRes] = await Promise.all([
      fetch(`/api/admin/tournament/${tournamentId}/settings`, { cache: "no-store" }),
      fetch("/api/admin/auth/me", { cache: "no-store" }),
    ]);

    const json = await res.json();
    const meJson = await meRes.json();

    setData(json);
    setMe(meJson);

    setDate(json.tournament?.date ?? "");
    setStartTime(json.tournament?.start_time ?? "");
    setChiefJudgeUserId(json.tournament?.chief_judge_user_id ?? meJson?.user?.id ?? "");
    setJudgeIds((json.judges ?? []).map((x: any) => x.id));

    setP1(Number(json.tournament?.points_c1 ?? 3));
    setP2(Number(json.tournament?.points_c2 ?? 2));
    setP3(Number(json.tournament?.points_c3 ?? 2));
    setP4(Number(json.tournament?.points_c4 ?? 1));

    setOverrides(
      (json.overrides ?? []).map((o: any) => ({
        stage_number: Number(o.stage_number),
        points_c1: Number(o.points_c1),
        points_c2: Number(o.points_c2),
        points_c3: Number(o.points_c3),
        points_c4: Number(o.points_c4),
      }))
    );

    setMsg(null);
    setErr(null);
  }

  useEffect(() => {
    if (tournamentId) load();
  }, [tournamentId]);

  const isAdmin = !!me?.user?.roles?.includes("ADMIN");
  const canEditPreStart = !data?.flags?.started;
  const canEditChiefJudge = isAdmin;

  function toggleJudge(userId: string) {
    setJudgeIds((prev) =>
      prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId]
    );
  }

  function selectAllJudges() {
    setJudgeIds((data?.judgeOptions ?? []).map((u: any) => u.id));
  }

  function clearAllJudges() {
    setJudgeIds([]);
  }

  function addOverrideRow() {
    setOverrides((prev) => [
      ...prev,
      {
        ...emptyOverrideRow({ p1, p2, p3, p4 }),
        stage_number: prev.length + 1,
      },
    ]);
  }

  function updateOverride(index: number, patch: Partial<OverrideRow>) {
    setOverrides((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeOverride(index: number) {
    setOverrides((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    setErr(null);

    try {
      const res = await adminFetch(`/api/admin/tournament/${tournamentId}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          start_time: startTime,
          chief_judge_user_id: chiefJudgeUserId,
          judge_ids: judgeIds,
          points_c1: p1,
          points_c2: p2,
          points_c3: p3,
          points_c4: p4,
          overrides,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErr(json?.error?.message ?? json?.error ?? "Не удалось сохранить настройки турнира.");
        return;
      }

      setMsg("Сохранено.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <main className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        Загрузка...
      </main>
    );
  }

  const st = statusBadge(data.tournament?.status ?? "draft");
  const md = modeBadge((data.tournament?.registration_mode ?? "SOLO") as "TEAM" | "SOLO");

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold text-slate-900">{data.tournament?.name}</h1>

            <div className="mt-4 rounded-2xl border border-slate-200 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <span>
                  {data.tournament?.date}
                  {data.tournament?.start_time ? ` · ${data.tournament.start_time}` : ""}
                </span>

                <span
                  className="inline-flex rounded-full border px-2 py-1 text-xs font-bold"
                  style={md.style}
                >
                  {md.text}
                </span>

                <span
                  className="inline-flex rounded-full border px-2 py-1 text-xs font-bold"
                  style={st.style}
                >
                  {st.text}
                </span>

                <span className="text-slate-400">•</span>

                <span className="text-sm text-slate-700">
                  Главный судья:{" "}
                  <span className="font-semibold text-slate-900">
                    {data.currentChiefJudgeName || "—"}
                  </span>
                </span>
              </div>
            </div>
            <div className="mt-2">
              <TournamentTabs tournamentId={tournamentId} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/tournaments"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              ← Турниры
            </Link>

            <button
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
              onClick={load}
              type="button"
            >
              Обновить
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="text-sm">
              <div className="mb-1 font-semibold text-slate-700">Дата и время начала</div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) 170px",
                  gap: "12px",
                  alignItems: "start",
                }}
              >
                <input
                  type="date"
                  min={today}
                  disabled={!canEditPreStart}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-50 disabled:text-slate-500"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />

                <input
                  type="time"
                  step="60"
                  lang="en-GB"
                  disabled={!canEditPreStart}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-50 disabled:text-slate-500"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>

              {!canEditPreStart && (
                <div className="mt-2 text-xs text-slate-500">
                  Дату и время можно менять только до начала турнира.
                </div>
              )}
            </div>

            <div style={{ height: "12px" }} />

            <label className="block text-sm">
              <div className="mb-1 font-semibold text-slate-700">Главный судья</div>

              {canEditChiefJudge ? (
                (data.chiefJudgeOptions ?? []).length > 0 ? (
                  <select
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                    value={chiefJudgeUserId}
                    onChange={(e) => setChiefJudgeUserId(e.target.value)}
                  >
                    {(data.chiefJudgeOptions ?? []).map((u: any) => (
                      <option key={u.id} value={u.id}>
                        {u.last_name} {u.first_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    Нет активных пользователей с ролью Главный судья.
                  </div>
                )
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {data.currentChiefJudgeName || "—"}
                </div>
              )}
            </label>
          </div>

          <div className="text-sm">
            <div className="mb-1 flex items-center justify-between gap-3">
              <div className="font-semibold text-slate-700">Судьи турнира</div>

              {(data.judgeOptions ?? []).length > 0 && (
                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    className="font-semibold text-orange-700/80 hover:text-orange-700 hover:underline"
                    onClick={selectAllJudges}
                  >
                    Выбрать всех
                  </button>
                  <button
                    type="button"
                    className="font-semibold text-orange-700/80 hover:text-orange-700 hover:underline"
                    onClick={clearAllJudges}
                  >
                    Очистить
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              {(data.judgeOptions ?? []).length === 0 ? (
                <div className="text-sm text-slate-500">Нет активных пользователей с ролью Судья.</div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {(data.judgeOptions ?? []).map((u: any) => (
                    <label
                      key={u.id}
                      className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={judgeIds.includes(u.id)}
                        onChange={() => toggleJudge(u.id)}
                      />
                      <span className="text-sm text-slate-700">
                        {u.last_name} {u.first_name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-sm">
          <div className="mb-1 font-semibold text-slate-700">Очки за корты</div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 88px)",
              gap: "10px",
              alignItems: "start",
              justifyContent: "start",
            }}
          >
            {[
              { value: p1, set: setP1, label: "Корт 1" },
              { value: p2, set: setP2, label: "Корт 2" },
              { value: p3, set: setP3, label: "Корт 3" },
              { value: p4, set: setP4, label: "Корт 4" },
            ].map((row, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                }}
              >
                <input
                  type="number"
                  disabled={!canEditPreStart}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-50 disabled:text-slate-500"
                  value={row.value}
                  onChange={(e) => row.set(Number(e.target.value))}
                />
                <div
                  className="mt-1 text-xs text-slate-500"
                  style={{
                    textAlign: "left",
                    paddingLeft: "2px",
                    lineHeight: 1.2,
                  }}
                >
                  {row.label}
                </div>
              </div>
            ))}
          </div>

          {!canEditPreStart && (
            <div className="mt-2 text-xs text-slate-500">
              Очки на кортах можно менять только до начала турнира.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-700">Особые очки по матчам</div>
            <div className="mt-1 text-xs text-slate-500">
              Для отдельных матчей можно задать очки, отличные от базовых.
            </div>
            <div style={{ height: "10px" }} />
          </div>

          <button
            type="button"
            disabled={!canEditPreStart}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
            onClick={addOverrideRow}
          >
            Добавить матч
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          {overrides.length === 0 ? (
            <div className="text-sm text-slate-600">Пока нет особых условий.</div>
          ) : (
            <div className="grid gap-2">
              {overrides.map((row, idx) => (
                <div
                  key={`${row.stage_number}-${idx}`}
                  className="rounded-2xl border border-slate-100 p-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-bold">Матч №</div>
                      <input
                        type="number"
                        min={1}
                        disabled={!canEditPreStart}
                        className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                        value={row.stage_number}
                        onChange={(e) =>
                          updateOverride(idx, {
                            stage_number: Number(e.target.value),
                          })
                        }
                      />
                    </div>

                    <button
                      type="button"
                      disabled={!canEditPreStart}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
                      onClick={() => removeOverride(idx)}
                    >
                      Удалить
                    </button>
                  </div>

                  <div className="mt-2">
                    <div className="text-xs font-semibold text-slate-600">Очки за корты (c1..c4)</div>
                    <div className="mt-1 grid grid-cols-4 gap-2">
                      {[row.points_c1, row.points_c2, row.points_c3, row.points_c4].map((v, i) => (
                        <input
                          key={i}
                          type="number"
                          disabled={!canEditPreStart}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                          value={v}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (i === 0) updateOverride(idx, { points_c1: n });
                            if (i === 1) updateOverride(idx, { points_c2: n });
                            if (i === 2) updateOverride(idx, { points_c3: n });
                            if (i === 3) updateOverride(idx, { points_c4: n });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!canEditPreStart && (
            <div className="mt-3 text-xs text-slate-500">
              Особые очки по матчам можно менять только до начала турнира.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
            onClick={load}
            type="button"
          >
            Отменить изменения
          </button>

          <button
            className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-60"
            onClick={save}
            type="button"
            disabled={busy}
          >
            {busy ? "Сохраняем..." : "Сохранить"}
          </button>
        </div>

        {msg && <div className="mt-3 text-sm font-semibold text-emerald-600">{msg}</div>}
        {err && <div className="mt-3 text-sm font-semibold text-red-600">{err}</div>}
      </section>
    </main>
  );
}