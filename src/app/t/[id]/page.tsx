// src/app/t/[id]/page.tsx
/*
Purpose:
Public tournament showcase page.

Page layout:
Section 1 — Tournament header
- tournament name
- date / time
- mode badge
- status badge
- chief judge
- button: ← Все турниры
- optional “Подать заявку” when tournament is open for registration

Section 2 — Registrations or team rating
- before teams / before match start in the relevant mode:
  - accepted registrations list
  - reserve shown at bottom
- later:
  - team rating table

Section 3 — Current match
- court cards
- teams on each court
- optional score
- winner/loser movement hints when relevant

Responsibilities:
1. Load a public payload from `/api/tournament/[id]/public`.
2. Display the correct tournament presentation depending on lifecycle:
   - draft
   - live
   - finished
   - canceled
3. Show registrations before competitive team view is available.
4. Show team standings once tournament mechanics have meaningfully started.
5. Hide or reduce sensitive/internal details not intended for public audience.

Reserve presentation:
- reserve rows grouped below accepted list
- reserve confirmation link shown only when relevant

Design intent:
This page is the public “front door” of a tournament and should be readable,
clean, and visually consistent with the admin-side card language.

Outcome:
Provides the single public-facing state summary of a tournament for players and spectators.
*/

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Payload = any;

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

function Tag({
  kind,
  text,
}: {
  kind: "accepted" | "reserve";
  text: string;
}) {
  const style =
    kind === "accepted"
      ? {
        backgroundColor: "#FFF7ED",
        color: "#C2410C",
        borderColor: "#FED7AA",
      }
      : {
        backgroundColor: "#F8FAFC",
        color: "#475569",
        borderColor: "#E2E8F0",
      };

  return (
    <span
      className="inline-flex w-[78px] items-center justify-center rounded-full border px-2.5 py-1 text-[12px] font-extrabold"
      style={style}
    >
      {text}
    </span>
  );
}

export default function TournamentShowcase() {
  const params = useParams();
  const id = (params as any).id as string;

  const [p, setP] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const res = await fetch(`/api/tournament/${id}/public`);
    const json = await res.json();
    if (!res.ok) {
      setErr("Не удалось загрузить турнир");
      return;
    }
    setP(json);
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  const t = p?.tournament;
  const teams = p?.teams ?? [];
  const games = p?.games ?? [];
  const nameById = useMemo(() => new Map(teams.map((x: any) => [x.id, x.name])), [teams]);

  function teamName(teamId: any): string {
    const v = nameById.get(teamId);
    if (typeof v === "string" && v.trim()) return v;
    if (v == null) return "—";
    return String(v);
  }

  const regsRaw = p?.registrations ?? [];

  const regs = useMemo(() => {
    const main = regsRaw
      .filter((r: any) => !r.is_reserve)
      .sort((a: any, b: any) => (a.created_at || "").localeCompare(b.created_at || ""));
    const reserve = regsRaw
      .filter((r: any) => !!r.is_reserve)
      .sort((a: any, b: any) => (a.created_at || "").localeCompare(b.created_at || ""));
    return [...main, ...reserve];
  }, [regsRaw]);

  const hasReserve = regs.some((r: any) => !!r.is_reserve);

  const showTeamRating =
    t?.registration_mode === "TEAM" ? t?.status !== "draft" : teams.length > 0;

  if (err) {
    return (
      <main className="space-y-6">
        <section className="rounded-3xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <div className="text-sm font-semibold text-red-700">{err}</div>
        </section>
      </main>
    );
  }

  if (!t) {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            Загрузка...
          </section>
        </div>
      </main>
    );
  }

  const canApply = t.status === "draft";
  const canceled = t.status === "canceled";

  function pointsForCourt(court: number) {
    if (!t) return null;
    if (court === 1) return t.points_c1;
    if (court === 2) return t.points_c2;
    if (court === 3) return t.points_c3;
    if (court === 4) return t.points_c4;
    return null;
  }

  const nextMatchStarted = !!p?.nextStageExists;
  const showMoves = !nextMatchStarted && t.status !== "finished" && t.status !== "canceled";

  function moveBadgePublic(court: number, winnerTeamId: string | null, teamId: string) {
    if (!showMoves) return null;
    if (!winnerTeamId) return null;

    const isWinner = winnerTeamId === teamId;
    const canMoveUp = court > 1;
    const canMoveDown = court < 4;

    if (isWinner && !canMoveUp) return null;
    if (!isWinner && !canMoveDown) return null;

    const target = isWinner ? Math.max(1, court - 1) : Math.min(4, court + 1);

    return (
      <span
        className={
          "ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-extrabold " +
          (isWinner ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")
        }
        title={isWinner ? "Победитель поднимается выше" : "Проигравший опускается ниже"}
      >
        {isWinner ? "↗" : "↘"} к {target}
      </span>
    );
  }

  function rowBg(winnerId: string | null, teamId: string) {
    if (!winnerId) return "bg-slate-50";
    return winnerId === teamId ? "bg-emerald-50" : "bg-red-50";
  }

  const st = statusBadge(t.status);
  const md = modeBadge(t.registration_mode);

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: "minmax(0, 1fr) auto",
              alignItems: "start",
            }}
          >
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold text-slate-900">{t.name}</h1>

              <div className="mt-4 rounded-2xl border border-slate-200 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
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

                <div className="mt-2 text-sm text-slate-700">
                  Главный судья:{" "}
                  <span className="font-semibold text-slate-900">
                    {t.chief_judge_name || "—"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <Link
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                href="/"
              >
                ← Все турниры
              </Link>

              {canApply && (
                <Link
                  className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700"
                  href={`/t/${id}/apply`}
                >
                  Подать заявку
                </Link>
              )}
            </div>
          </div>

          {canceled && (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5">
              <div className="text-lg font-extrabold text-red-800">Турнир отменён</div>
              <div className="mt-2 text-sm text-red-700">
                Подача заявок и любые операции по турниру недоступны. Все заявки считаются отменёнными.
              </div>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {showTeamRating ? (
            <>
              <h2 className="text-lg font-bold">Рейтинг команд</h2>

              <div className="mt-4 grid gap-2">
                {teams.map((tm: any, idx: number) => (
                  <div
                    key={tm.id}
                    className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2"
                  >
                    <div className="text-sm font-semibold">
                      <span className="mr-2 font-extrabold text-orange-600">{idx + 1}</span>
                      {tm.name}
                    </div>
                    <div className="text-sm font-bold">{tm.points}</div>
                  </div>
                ))}

                {teams.length === 0 && (
                  <div className="text-sm text-slate-600">
                    Пока нет команд (или они ещё не сформированы).
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold">Заявки</h2>

              <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
                {regs.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-slate-600">Пока нет принятых заявок.</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {regs.map((r: any, idx: number) => {
                      const isReserve = !!r.is_reserve;
                      const prev = regs[idx - 1];
                      const startReserve = isReserve && (!prev || !prev.is_reserve);

                      return (
                        <div key={r.id}>
                          {startReserve && (
                            <div className="flex items-center gap-3 px-3 py-2 text-xs font-bold text-slate-500">
                              <div className="h-px flex-1 bg-slate-200" />
                              Резерв
                              <div className="h-px flex-1 bg-slate-200" />
                            </div>
                          )}

                          <div className="flex items-center gap-3 px-3 py-3">
                            <div className="w-7 shrink-0 text-right text-sm font-extrabold text-slate-400">
                              {idx + 1}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-slate-900">
                                {r.full_name}
                              </div>
                            </div>

                            <div className="shrink-0">
                              {isReserve ? (
                                <Tag kind="reserve" text="Резерв" />
                              ) : (
                                <Tag kind="accepted" text="Принята" />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {hasReserve && (
                <div className="mt-3 text-sm text-slate-600">
                  Если Вы получили уведомление о переходе из резерва в основу,{" "}
                  <Link
                    className="font-semibold text-orange-700 hover:underline"
                    href={`/t/${id}/reserve-confirm`}
                  >
                    подтвердите переход здесь →
                  </Link>
                </div>
              )}
            </>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Текущий матч</h2>
            <div className="text-sm text-slate-600">
              {p?.latestStage?.number ? `Матч №${p.latestStage.number}` : "нет"}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {games.map((g: any) => {
              const winnerId = (g.winner_team_id ?? null) as string | null;
              const points = pointsForCourt(g.court);

              const badgeA = moveBadgePublic(g.court, winnerId, g.team_a_id);
              const badgeB = moveBadgePublic(g.court, winnerId, g.team_b_id);

              return (
                <div
                  key={g.id}
                  className="h-full rounded-2xl border border-slate-100 p-4 sm:min-h-[210px]"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold text-slate-700">Корт {g.court}</div>
                    <div className="text-sm font-semibold text-slate-600">
                      {points != null ? `Очки: +${points}` : ""}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 text-sm">
                    <div
                      className={
                        "flex items-start justify-between gap-2 rounded-xl border border-transparent px-3 py-2 " +
                        rowBg(winnerId, g.team_a_id)
                      }
                    >
                      <div className="min-h-[2.75rem] flex-1 pr-2">
                        <div className="line-clamp-2 break-words text-sm font-semibold leading-tight text-slate-900">
                          {teamName(g.team_a_id)}
                        </div>
                      </div>

                      <div className="shrink-0 pt-0.5">{badgeA}</div>
                    </div>

                    <div
                      className={
                        "flex items-start justify-between gap-2 rounded-xl border border-transparent px-3 py-2 " +
                        rowBg(winnerId, g.team_b_id)
                      }
                    >
                      <div className="min-h-[2.75rem] flex-1 pr-2">
                        <div className="line-clamp-2 break-words text-sm font-semibold leading-tight text-slate-900">
                          {teamName(g.team_b_id)}
                        </div>
                      </div>

                      <div className="shrink-0 pt-0.5">{badgeB}</div>
                    </div>
                  </div>

                  {!!g.score_text && (
                    <div className="mt-3 text-sm text-slate-600">
                      Счёт: <b className="text-slate-900">{g.score_text}</b>
                    </div>
                  )}
                </div>
              );
            })}

            {games.length === 0 && (
              <div className="text-sm text-slate-600">Матчи ещё не созданы.</div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}