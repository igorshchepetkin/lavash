// src/app/admin/tournaments/page.tsx
/*
Purpose:
Admin home page for active tournaments.

Responsibilities:
1. Load current admin user context.
2. Load visible active tournaments.
3. Load selectable admin users for tournament creation
   (chief judges / judges depending on role).
4. Render a list of active tournaments with badges and chief judge info.
5. Provide tournament creation UI in a modal form.
6. Hide archived tournaments from the main list.

Tournament card behavior:
- Shows:
  - name
  - date
  - start time
  - registration mode badge
  - status badge
  - chief judge name
- “Open” button is smart:
  - if status == draft -> opens registrations page
  - otherwise -> opens matches page

Create tournament modal:
- Used instead of inline block for better focus and cleaner page layout
- Includes:
  - name
  - date
  - start time
  - registration mode
  - chief judge
  - base court points
  - match-specific point overrides
- For ADMIN:
  - chief judge selected from active users with CHIEF_JUDGE role
- For CHIEF_JUDGE:
  - chief judge is fixed to current user

Validation goals:
- chief judge is mandatory
- creation disabled if no available chief judge exists
- overrides are configurable before tournament start
- modal blocks page interaction and supports ESC close

Design intent:
Tournament list is the entry point into the whole admin workflow,
so the page must stay visually clean and rarely-used creation controls
should not permanently occupy the screen.

Outcome:
Provides the main operational landing page for tournament administration.
*/

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { adminFetch } from "@/lib/adminClient";


type Tournament = {
  id: string;
  name: string;
  date: string;
  start_time: string | null;
  registration_mode: "TEAM" | "SOLO";
  status: string;
  chief_judge_user_id?: string | null;
  chief_judge_name?: string | null;
};

type UserOption = {
  id: string;
  first_name: string;
  last_name: string;
  login: string;
  roles: string[];
  is_active: boolean;
};

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

function cardAccent(status: string) {
  switch (status) {
    case "draft":
      return "#F59E0B";
    case "live":
      return "#0EA5E9";
    default:
      return "#FFFFFF";
  }
}

function emptyOverrideRow(): OverrideRow {
  return {
    stage_number: 1,
    points_c1: 3,
    points_c2: 2,
    points_c3: 2,
    points_c4: 1,
  };
}

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [me, setMe] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [name, setName] = useState("Лаваш");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("17:00");
  const [mode, setMode] = useState<"TEAM" | "SOLO">("SOLO");
  const [p1, setP1] = useState(3);
  const [p2, setP2] = useState(2);
  const [p3, setP3] = useState(2);
  const [p4, setP4] = useState(1);
  const [chiefJudgeUserId, setChiefJudgeUserId] = useState("");
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [overridesOpen, setOverridesOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setError(null);

    try {
      const [resT, resM] = await Promise.all([
        fetch("/api/admin/tournaments", { cache: "no-store" }),
        fetch("/api/admin/auth/me", { cache: "no-store" }),
      ]);

      const jsonT = await resT.json().catch(() => ({}));
      const jsonM = await resM.json().catch(() => ({}));

      if (!resT.ok) {
        setError(jsonT?.error ?? "Не удалось загрузить турниры.");
        setTournaments([]);
      } else {
        setTournaments(jsonT.tournaments ?? []);
      }

      setMe(jsonM ?? null);

      const resU = await fetch("/api/admin/users", { cache: "no-store" });
      if (resU.ok) {
        const jsonU = await resU.json().catch(() => ({}));
        setUsers(jsonU.users ?? []);
      } else {
        setUsers([]);
      }
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const chiefOptions = useMemo(
    () => users.filter((u) => u.roles?.includes("CHIEF_JUDGE") && u.is_active),
    [users]
  );

  const isAdmin = !!me?.user?.roles?.includes("ADMIN");
  const canCreate = !!me?.user?.roles?.some((r: string) => r === "ADMIN" || r === "CHIEF_JUDGE");

  useEffect(() => {
    if (!showCreateModal) return;

    if (isAdmin) {
      if (!chiefJudgeUserId && chiefOptions.length) {
        setChiefJudgeUserId(chiefOptions[0].id);
      }
    } else if (me?.user?.id) {
      setChiefJudgeUserId(me.user.id);
    }
  }, [showCreateModal, isAdmin, chiefJudgeUserId, chiefOptions, me?.user?.id]);

  useEffect(() => {
    if (!showCreateModal) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        setShowCreateModal(false);
        setError(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showCreateModal, busy]);

  useEffect(() => {
    if (!showCreateModal) return;

    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [showCreateModal]);

  function resetForm() {
    setName("Лаваш");
    setDate(new Date().toISOString().slice(0, 10));
    setStartTime("17:00");
    setMode("SOLO");
    setP1(3);
    setP2(2);
    setP3(2);
    setP4(1);
    setOverrides([]);
    setOverridesOpen(false);
    setError(null);

    if (isAdmin) {
      setChiefJudgeUserId(chiefOptions[0]?.id ?? "");
    } else {
      setChiefJudgeUserId(me?.user?.id ?? "");
    }
  }

  function openCreateModal() {
    resetForm();
    setShowCreateModal(true);
  }

  function closeCreateModal() {
    if (busy) return;
    setShowCreateModal(false);
    setError(null);
  }

  function addOverrideRow() {
    setOverrides((prev) => [
      ...prev,
      {
        ...emptyOverrideRow(),
        stage_number: prev.length + 1,
        points_c1: p1,
        points_c2: p2,
        points_c3: p3,
        points_c4: p4,
      },
    ]);
  }

  function openOverrides() {
    if (!overridesOpen) {
      setOverridesOpen(true);
    }

    if (overrides.length === 0) {
      setOverrides([
        {
          ...emptyOverrideRow(),
          stage_number: 1,
          points_c1: p1,
          points_c2: p2,
          points_c3: p3,
          points_c4: p4,
        },
      ]);
    }
  }

  function updateOverride(index: number, patch: Partial<OverrideRow>) {
    setOverrides((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeOverride(index: number) {
    setOverrides((prev) => prev.filter((_, i) => i !== index));
  }

  function openTournamentHref(t: Tournament) {
    return t.status === "draft"
      ? `/admin/t/${t.id}/registrations`
      : `/admin/t/${t.id}/ops`;
  }

  async function createTournament() {
    setBusy(true);
    setError(null);

    try {
      const res = await adminFetch("/api/admin/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          date,
          start_time: startTime,
          registration_mode: mode,
          points_c1: p1,
          points_c2: p2,
          points_c3: p3,
          points_c4: p4,
          chief_judge_user_id: chiefJudgeUserId || null,
          overrides,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json?.error?.message ?? json?.error ?? "Ошибка создания турнира");
        return;
      }

      await load();
      closeCreateModal();
    } finally {
      setBusy(false);
    }
  }

  const createDisabled =
    busy ||
    !name.trim() ||
    !date ||
    !mode ||
    !chiefJudgeUserId ||
    (isAdmin && chiefOptions.length === 0);

  const modal =
    mounted && showCreateModal
      ? createPortal(
        <div
          onClick={closeCreateModal}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999999,
            background: "rgba(2, 6, 23, 0.45)",
            padding: "16px",
          }}
        >
          <div
            style={{
              minHeight: "100%",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              paddingTop: "24px",
              paddingBottom: "24px",
            }}
          >
            <section
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded-2xl border border-slate-200 bg-white shadow-2xl"
              style={{
                maxWidth: "880px",
                maxHeight: "calc(100vh - 48px)",
                overflowY: "auto",
                overflowX: "hidden",
                boxShadow: "0 24px 64px rgba(15, 23, 42, 0.22)",
              }}
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Создать турнир</h2>
                  <div className="mt-1 text-sm text-slate-500">
                    Турнир создаётся в статусе черновика. Главный судья обязателен.
                  </div>
                </div>

                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                  onClick={closeCreateModal}
                >
                  Закрыть
                </button>
              </div>

              <div className="p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <label className="block text-sm">
                      <div className="mb-1 font-semibold text-slate-700">Название</div>
                      <input
                        className="w-full rounded-xl border border-slate-200 px-3 py-2"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>

                    <label className="block text-sm">
                      <div className="mb-1 font-semibold text-slate-700">Режим заявок</div>
                      <select
                        className="w-full rounded-xl border border-slate-200 px-3 py-2"
                        value={mode}
                        onChange={(e) => setMode(e.target.value as "TEAM" | "SOLO")}
                      >
                        <option value="SOLO">SOLO (по одному игроку)</option>
                        <option value="TEAM">TEAM (сразу команда 3 человека)</option>
                      </select>
                    </label>

                    <div
                      style={{
                        height: "12px"
                      }}
                    ></div>

                    <label className="block text-sm">
                      <div className="mb-1 font-semibold text-slate-700">Главный судья</div>

                      {isAdmin ? (
                        chiefOptions.length > 0 ? (
                          <select
                            className="w-full rounded-xl border border-slate-200 px-3 py-2"
                            value={chiefJudgeUserId}
                            onChange={(e) => setChiefJudgeUserId(e.target.value)}
                          >
                            {chiefOptions.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.last_name} {u.first_name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                            Нет ни одного активного пользователя с ролью Главный судья.
                            Создание турнира невозможно.
                          </div>
                        )
                      ) : (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          {me?.user?.last_name} {me?.user?.first_name}
                        </div>
                      )}
                    </label>
                  </div>

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
                          className="w-full rounded-xl border border-slate-200 px-3 py-2"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                        />

                        <input
                          type="time"
                          step="60"
                          lang="en-GB"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="text-sm">
                      <div className="mb-1 font-semibold text-slate-700">Очки за корты</div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                          gap: "8px",
                          alignItems: "start",
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
                              className="w-full rounded-xl border border-slate-200 px-3 py-2"
                              value={row.value}
                              onChange={(e) => row.set(Number(e.target.value))}
                            />
                            <div
                              className="mt-1 text-xs text-slate-500"
                              style={{
                                textAlign: "left",
                                paddingLeft: "12px",
                                lineHeight: 1.2,
                              }}
                            >
                              {row.label}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="text-sm">
                      {!overridesOpen ? (
                        <>
                          <button
                            type="button"
                            onClick={openOverrides}
                            className="flex items-center gap-2 p-0 text-sm font-semibold text-slate-700 hover:text-orange-700 hover:underline"
                          >
                            Особые очки по матчам...
                          </button>

                          <div className="mt-1 text-xs text-slate-500">
                            Можно задать другие очки для отдельных матчей. Например, для первого матча всем по 1 очку.
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => setOverridesOpen(false)}
                              className="flex items-center gap-2 p-0 text-sm font-semibold text-slate-700 hover:text-orange-700 hover:underline"
                            >
                              Особые очки по матчам
                            </button>
                            <button
                              type="button"
                              className="p-0 text-sm font-semibold text-orange-700/80 hover:text-orange-700 hover:underline"
                              onClick={addOverrideRow}
                            >
                              Добавить матч
                            </button>
                          </div>

                          <div className="mt-3 rounded-2xl border border-slate-200 p-4">
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
                                          className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm"
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
                                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                                        onClick={() => removeOverride(idx)}
                                      >
                                        Удалить
                                      </button>
                                    </div>

                                    <div className="mt-2">
                                      <div className="text-xs font-semibold text-slate-600">
                                        Очки за корты (c1..c4)
                                      </div>

                                      <div className="mt-1 grid grid-cols-4 gap-2">
                                        {[row.points_c1, row.points_c2, row.points_c3, row.points_c4].map(
                                          (v, i) => (
                                            <input
                                              key={i}
                                              type="number"
                                              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                              value={v}
                                              onChange={(e) => {
                                                const n = Number(e.target.value);
                                                if (i === 0) updateOverride(idx, { points_c1: n });
                                                if (i === 1) updateOverride(idx, { points_c2: n });
                                                if (i === 2) updateOverride(idx, { points_c3: n });
                                                if (i === 3) updateOverride(idx, { points_c4: n });
                                              }}
                                            />
                                          )
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="mt-3 text-xs text-slate-500">
                              Совет: для “первые 2 матча по 1 очку” добавьте Матч №1 и Матч №2 и выставь c1..c4 = 1.
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {error && <div className="mt-4 text-sm font-semibold text-red-600">{error}</div>}
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 p-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                  onClick={closeCreateModal}
                >
                  Отмена
                </button>

                <button
                  disabled={createDisabled}
                  className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"
                  onClick={createTournament}
                  type="button"
                >
                  {busy ? "Создаём..." : "Создать"}
                </button>
              </div>
            </section>
          </div>
        </div>,
        document.body
      )
      : null;

  if (!loaded) {
    return (
      <main className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          Загрузка...
        </section>
      </main>
    );
  }

  return (
    <>
      <main className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900">Турниры</h1>
              <p className="mt-1 text-sm text-slate-500">
                Список активных турниров. Архив вынесен{" "}
                <Link href="/admin/archive" className="font-semibold text-orange-700 hover:underline">
                  отдельно
                </Link>
                .
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {canCreate && (
                <button
                  className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700"
                  onClick={openCreateModal}
                  type="button"
                >
                  Создать турнир
                </button>
              )}
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
          <div className="grid gap-3">
            {tournaments.map((t) => {
              const st = statusBadge(t.status);
              const md = modeBadge(t.registration_mode);

              return (
                <div
                  key={t.id}
                  className="rounded-2xl border border-slate-200 p-4"
                  style={{ borderLeftWidth: "6px", borderLeftColor: cardAccent(t.status) }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold text-slate-900">{t.name}</div>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                        <span>
                          {t.date}
                          {t.start_time ? ` · ${t.start_time}` : ""}
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
                      </div>

                      <div className="mt-2 text-sm text-slate-500">
                        Главный судья:{" "}
                        <span className="font-semibold text-slate-700">
                          {t.chief_judge_name || "—"}
                        </span>
                      </div>
                    </div>

                    <Link
                      className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700"
                      href={openTournamentHref(t)}
                    >
                      Открыть
                    </Link>
                  </div>
                </div>
              );
            })}

            {tournaments.length === 0 && (
              <div className="text-sm text-slate-500">Нет доступных турниров.</div>
            )}
          </div>
        </section>
      </main>

      {modal}
    </>
  );
}