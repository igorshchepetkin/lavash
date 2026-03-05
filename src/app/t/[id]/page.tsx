// src/app/t/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Payload = any;

function statusText(s: string) {
  if (s === "draft") return "Приём заявок";
  if (s === "live") return "Идёт";
  if (s === "finished") return "Завершён";
  return "Отменён";
}

function Tag({
  kind,
  text,
}: {
  kind: "accepted" | "reserve";
  text: string;
}) {
  const cls =
    kind === "accepted"
      ? "bg-orange-50 text-orange-700 border-orange-200"
      : "bg-slate-50 text-slate-600 border-slate-200";

  return (
    <span
      className={
        "inline-flex w-[78px] justify-center items-center rounded-full border px-2.5 py-1 text-[12px] font-extrabold " +
        cls
      }
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
  const nameById = useMemo(
    () => new Map(teams.map((x: any) => [x.id, x.name])),
    [teams]
  );

  function teamName(teamId: any): string {
    const v = nameById.get(teamId);
    if (typeof v === "string" && v.trim()) return v;
    if (v == null) return "—";
    return String(v);
  }

  const regsRaw = p?.registrations ?? [];

  // Sort for public showcase:
  // 1) main (not reserve) first
  // 2) reserve at bottom
  // 3) inside each bucket: by created_at asc (as before)
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

  // When to show team rating section:
  // - SOLO: show rating only if teams already built
  // - TEAM: show rating only after tournament is live (first match started)
  const showTeamRating =
    t?.registration_mode === "TEAM" ? t?.status !== "draft" : teams.length > 0;

  if (err) {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {err}
          </div>
        </div>
      </main>
    );
  }

  if (!t) {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-slate-600">
          Загрузка…
        </div>
      </main>
    );
  }

  const dt = `${t.date}${t.start_time ? ` · ${t.start_time}` : ""}`;
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
    // если победителя ещё нет — нейтрально
    if (!winnerId) return "bg-slate-50";
    // иначе: победитель зелёный, проигравший красный
    return winnerId === teamId ? "bg-emerald-50" : "bg-red-50";
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t.name}</h1>
            <div className="mt-1 text-sm text-slate-600">
              {dt} · <b className="text-orange-600">{t.registration_mode}</b> ·{" "}
              <b className={canceled ? "text-red-700" : "text-orange-600"}>
                {statusText(t.status)}
              </b>
            </div>
          </div>

          <div className="flex gap-2">
            <a
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
              href="/"
            >
              ← Все турниры
            </a>

            {canApply && (
              <a
                className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700"
                href={`/t/${id}/apply`}
              >
                Подать заявку
              </a>
            )}
          </div>
        </div>

        {canceled && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
            <div className="text-lg font-extrabold text-red-800">Турнир отменён</div>
            <div className="mt-2 text-sm text-red-700">
              Подача заявок и любые операции по турниру недоступны. Все заявки считаются
              отменёнными.
            </div>
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-slate-200 p-5">
          {showTeamRating ? (
            <>
              <h2 className="text-lg font-bold">Рейтинг команд</h2>
              <div className="mt-3 grid gap-2">
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

              <div className="mt-3 overflow-hidden rounded-xl border border-slate-100">
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
                  <a
                    className="font-semibold text-orange-700 hover:underline"
                    href={`/t/${id}/reserve-confirm`}
                  >
                    подтвердите переход здесь →
                  </a>
                </div>
              )}
            </>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Текущий матч</h2>
            <div className="text-sm text-slate-600">
              {p?.latestStage?.number ? `Матч №${p.latestStage.number}` : "нет"}
            </div>
          </div>

          {/* 2x2 grid like ops (on >=sm) */}
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