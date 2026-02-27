"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Payload = any;

function statusText(s: string) {
  if (s === "draft") return "приём заявок";
  if (s === "live") return "идёт";
  if (s === "finished") return "завершён";
  return "отменён";
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

  useEffect(() => { if (id) load(); }, [id]);

  const t = p?.tournament;
  const teams = p?.teams ?? [];
  const games = p?.games ?? [];
  const nameById = useMemo(() => new Map(teams.map((x: any) => [x.id, x.name])), [teams]);

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
        <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-slate-600">Загрузка…</div>
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

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t.name}</h1>
            <div className="mt-1 text-sm text-slate-600">
              {dt} · <b className="text-orange-600">{t.registration_mode}</b> ·{" "}
              <b className={canceled ? "text-red-700" : "text-orange-600"}>{statusText(t.status)}</b>
            </div>
          </div>

          <div className="flex gap-2">
            <a className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50" href="/">
              ← Все турниры
            </a>

            {canApply && (
              <a className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700" href={`/t/${id}/apply`}>
                Подать заявку
              </a>
            )}
          </div>
        </div>

        {canceled && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
            <div className="text-lg font-extrabold text-red-800">Турнир отменён</div>
            <div className="mt-2 text-sm text-red-700">
              Подача заявок и любые операции по турниру недоступны. Все заявки считаются отменёнными.
            </div>
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-slate-200 p-5">
          <h2 className="text-lg font-bold">Рейтинг команд</h2>
          <div className="mt-3 grid gap-2">
            {teams.map((tm: any, idx: number) => (
              <div key={tm.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                <div className="text-sm font-semibold">
                  <span className="mr-2 font-extrabold text-orange-600">{idx + 1}</span>
                  {tm.name}
                </div>
                <div className="text-sm font-bold">{tm.points}</div>
              </div>
            ))}
            {teams.length === 0 && <div className="text-sm text-slate-600">Пока нет команд (или они ещё не сформированы).</div>}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Текущий матч</h2>
            <div className="text-sm text-slate-600">{p?.latestStage?.number ? `Матч №${p.latestStage.number}` : "нет"}</div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[1, 2, 3, 4].map((court) => {
              const g = games.find((x: any) => x.court === court);
              if (!g) {
                return (
                  <div key={court} className="rounded-2xl border border-slate-100 p-4">
                    <div className="font-bold">Корт {court}</div>
                    <div className="mt-2 text-sm text-slate-600">Пока нет игры</div>
                  </div>
                );
              }

              const a = nameById.get(g.team_a_id) ?? "—";
              const b = nameById.get(g.team_b_id) ?? "—";
              const resolvedWinner = g.winner_team_id ?? null;

              const winnerCourt = Math.max(1, court - 1);
              const loserCourt = Math.min(4, court + 1);

              function moveBadge(teamId: string) {
                if (!showMoves) return null;
                if (!resolvedWinner) return null;

                const isWinner = resolvedWinner === teamId;
                const canMoveUp = court > 1;
                const canMoveDown = court < 4;

                if (isWinner && !canMoveUp) return null;
                if (!isWinner && !canMoveDown) return null;

                const target = isWinner ? winnerCourt : loserCourt;

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

              const teamClass = (teamId: string) =>
                "text-sm font-semibold " + (resolvedWinner === teamId ? "text-orange-700" : "text-slate-900");

              return (
                <div key={g.id} className="rounded-2xl border border-slate-100 p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-extrabold">
                      Корт {court}
                      {pointsForCourt(court) != null ? (
                        <span className="ml-2 text-xs font-bold text-slate-500">
                          (+{pointsForCourt(court)} очков)
                        </span>
                      ) : null}
                    </div>

                    {g.is_final && (
                      <div className="rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-700">
                        финал
                      </div>
                    )}
                  </div>

                  <div className={"mt-3 text-center " + teamClass(g.team_a_id)}>
                    {typeof a === "string" ? a : "—"}
                    {resolvedWinner ? moveBadge(g.team_a_id) : null}
                  </div>

                  <div className="text-center text-xs font-bold text-slate-400">VS</div>

                  <div className={"text-center " + teamClass(g.team_b_id)}>
                    {b}
                    {resolvedWinner ? moveBadge(g.team_b_id) : null}
                  </div>

                  <div className="mt-3 text-center text-sm text-slate-700">
                    {resolvedWinner ? (
                      <>
                        {g.score_text ? (
                          <>
                            Счёт: <b>{g.score_text}</b>
                          </>
                        ) : null}
                        {!g.points_awarded && !g.score_text ? (
                          <span className="text-slate-500">Результат внесён</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-slate-500">Результат ещё не внесён</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}