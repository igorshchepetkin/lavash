// src/app/admin/t/[id]/ops/page.tsx
/*
Purpose:
Operational match-management page for a tournament after setup.

Page layout:
Section 1 — Tournament header
- tournament name
- date / time
- mode badge
- status badge
- chief judge
- top-right buttons: ← Турниры / Обновить
- tournament tabs

Section 2 — Page actions
- Build teams (SOLO)
- Reset teams (SOLO)
- Start next match
- Finish tournament
- Cancel tournament
- Archive tournament (ADMIN only, terminal statuses only)

Section 3 — Main content
- SOLO players / seeding block (pre-build only)
- current match courts grid

Section 4 — Secondary content
- team rating / standings

Main responsibilities:
1. Load operational tournament state:
   - tournament
   - teams
   - latest stage
   - current games
   - SOLO player pre-build list
2. Enforce lifecycle guards for starting/finishing/canceling.
3. Provide result-entry UI for each court.
4. Support SOLO-specific team build/reset/seeding workflow.
5. Show current scoring and movement consequences via GameCard UI.

State model:
- before first match:
  - SOLO strength/seeding editable
  - teams may be built or reset
  - points overrides are configured on the settings page, not here
- during tournament:
  - current stage shown
  - results may be saved
  - next stage may be started only when current one is complete
- after finish:
  - tournament becomes read-only operationally
  - final standings emphasized
- after cancel:
  - match start button is hidden
  - tournament remains operationally read-only

Design intent:
This page is the judge’s real-time console during tournament execution,
so the primary actions must be prominent and fast.

Outcome:
Provides the live operational interface for tournament progression and result entry.
*/

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import TournamentTabs from "@/components/TournamentTabs";
import { adminFetch } from "@/lib/adminClient";

type StatePayload = any;

type SoloPlayerRow = {
    id: string;
    full_name: string;
    strength: number;
    seed_team_index: number | null;
    seed_slot: number | null;
    rank: number;
    bucket: 1 | 2 | 3 | null;
    team_index: number | null;
    team_slot: number | null;
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

export default function OpsPage() {
    const params = useParams<{ id: string }>();
    const tournamentId = params.id;

    const [state, setState] = useState<StatePayload | null>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const [teamsBusy, setTeamsBusy] = useState(false);
    const [startingMatch, setStartingMatch] = useState(false);

    const [soloPlayers, setSoloPlayers] = useState<SoloPlayerRow[]>([]);
    const [spBusyId, setSpBusyId] = useState<string | null>(null);
    const [spMsg, setSpMsg] = useState<string | null>(null);

    const [loaded, setLoaded] = useState(false);
    const [me, setMe] = useState<any | null>(null);

    async function load() {
        const [res, resMe] = await Promise.all([
            fetch(`/api/admin/tournament/${tournamentId}/state`),
            fetch(`/api/admin/auth/me`, { cache: "no-store" }),
        ]);

        const json = await res.json();
        const jsonMe = await resMe.json().catch(() => ({}));

        setState(json);
        setMe(jsonMe?.user ?? null);

        const resP = await fetch(`/api/admin/tournament/${tournamentId}/solo-players`);
        const jsonP = await resP.json();
        if (!resP.ok || !jsonP?.ok) {
            setSpMsg(jsonP?.error?.message ?? jsonP?.error ?? "Ошибка загрузки списка игроков");
            setSoloPlayers([]);
        } else {
            setSoloPlayers(jsonP.players ?? []);
        }

        setLoaded(true);
    }

    useEffect(() => {
        if (tournamentId) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tournamentId]);

    const teams = state?.teams ?? [];
    const games = state?.games ?? [];
    const latestStage = state?.latestStage ?? null;
    const t = state?.tournament;
    const status = t?.status as string | undefined;
    const canceled = status === "canceled";
    const finished = status === "finished";

    const latestNum = latestStage?.number ?? 0;
    const nextMatchNumber = latestNum + 1;

    const stageHasGames = (games?.length ?? 0) > 0;
    const stageComplete = stageHasGames && games.every((g: any) => !!g.winner_team_id);

    const canStartNext = !canceled && !finished && (latestNum === 0 || stageComplete);
    const canFinish = !canceled && !finished && latestNum > 0 && stageComplete;

    const nameById = useMemo(() => new Map(teams.map((x: any) => [x.id, x.name])), [teams]);
    const teamsBuilt = (teams?.length ?? 0) > 0;

    function pointsForCourt(court: number) {
        if (!t) return null;
        if (court === 1) return t.points_c1;
        if (court === 2) return t.points_c2;
        if (court === 3) return t.points_c3;
        if (court === 4) return t.points_c4;
        return null;
    }

    async function setSeed(playerId: string, seed_team_index: number | null) {
        setSpBusyId(playerId);
        setSpMsg(null);
        try {
            const res = await adminFetch(`/api/admin/tournament/${tournamentId}/solo-players/seed`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ playerId, seed_team_index }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSpMsg(json?.error?.message ?? json?.error ?? "Ошибка посева");
                return;
            }
            await load();
        } finally {
            setSpBusyId(null);
        }
    }

    async function buildTeamsSolo() {
        setTeamsBusy(true);
        setBusy(true);
        setMsg(null);
        try {
            const res = await adminFetch(`/api/admin/tournament/${tournamentId}/build-teams`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ seeds: [] }),
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setMsg(json?.error?.message ?? json?.error ?? "Ошибка");
                return;
            }

            setMsg("Команды собраны.");
            await load();
        } finally {
            setBusy(false);
            setTeamsBusy(false);
        }
    }

    async function resetTeams() {
        const ok = window.confirm(
            "Сбросить команды?\n\nБудет удалено распределение по командам.\nПосле этого можно снова менять уровни/посев и собрать команды заново."
        );
        if (!ok) return;

        setTeamsBusy(true);
        setBusy(true);
        setMsg(null);
        try {
            const res = await adminFetch(`/api/admin/tournament/${tournamentId}/reset-teams`, {
                method: "POST",
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setMsg(json?.error?.message ?? json?.error ?? "Ошибка сброса");
                return;
            }

            setMsg("Команды сброшены.");
            await load();
        } finally {
            setBusy(false);
            setTeamsBusy(false);
        }
    }

    async function start() {
        setBusy(true);
        setMsg(null);
        setStartingMatch(true);

        try {
            const res = await adminFetch(`/api/admin/tournament/${tournamentId}/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ seededPairs: [] }),
            });
            const json = await res.json();
            if (!res.ok) setMsg(json.error ?? "Ошибка");
            else setMsg("Турнир стартовал: Матч №" + nextMatchNumber + " создан.");
            await load();
        } finally {
            setStartingMatch(false);
            setBusy(false);
        }
    }

    async function cancelTournament() {
        const ok = window.confirm(
            "Отменить турнир НАВСЕГДА?\n\nПоследствия:\n- нельзя будет подавать заявки\n- нельзя будет формировать команды\n- нельзя будет стартовать/вносить результаты\n- все заявки будут считаться отменёнными\n\nДействие необратимо."
        );
        if (!ok) return;

        setBusy(true);
        setMsg(null);
        try {
            const res = await adminFetch(`/api/admin/tournament/${tournamentId}/cancel`, { method: "POST" });
            const json = await res.json();
            if (!res.ok) setMsg(json?.error ?? "Ошибка");
            else setMsg("Турнир отменён.");
            await load();
        } finally {
            setBusy(false);
        }
    }

    async function submitResult(gameId: string, winnerTeamId: string, scoreText: string): Promise<boolean> {
        setBusy(true);
        setMsg(null);
        try {
            const res = await adminFetch(`/api/admin/tournament/${tournamentId}/game/result`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ gameId, winnerTeamId, scoreText }),
            });
            const json = await res.json();
            if (!res.ok) {
                setMsg(json.error ?? "Ошибка");
                return false;
            }
            await load();
            return true;
        } finally {
            setBusy(false);
        }
    }

    async function finishTournament() {
        const ok = window.confirm(
            "Завершить турнир?\n\nCтарт новых матчей будет запрещён.\n\nДействие необратимо."
        );
        if (!ok) return;

        setBusy(true);
        try {
            const res = await adminFetch(`/api/admin/tournament/${tournamentId}/finish`, { method: "POST" });
            const json = await res.json();
            if (!res.ok) setMsg(json?.error ?? "Ошибка завершения");
            await load();
        } finally {
            setBusy(false);
        }
    }

    async function archiveTournament() {
        const ok = window.confirm(
            "Архивировать турнир?\n\nПосле этого он исчезнет из списка активных турниров и попадёт в архив."
        );
        if (!ok) return;

        setBusy(true);
        setMsg(null);
        try {
            const res = await adminFetch(`/api/admin/tournament/${tournamentId}/archive`, {
                method: "POST",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setMsg(json?.error ?? "Ошибка архивирования");
                return;
            }
            setMsg("Турнир архивирован.");
            await load();
        } finally {
            setBusy(false);
        }
    }

    if (!loaded) {
        return (
            <main className="space-y-6">
                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    Загрузка...
                </section>
            </main>
        );
    }

    const st = statusBadge(t?.status ?? "draft");
    const md = modeBadge((t?.registration_mode ?? "SOLO") as "TEAM" | "SOLO");

    return (
        <main className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-extrabold text-slate-900">{t?.name ?? "Турнир"}</h1>

                        <div className="mt-4 rounded-2xl border border-slate-200 px-4 py-3">
                            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                                <span>
                                    {t?.date}
                                    {t?.start_time ? ` · ${t.start_time}` : ""}
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
                                        {t?.chief_judge_name || "—"}
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
                <div className="flex flex-wrap gap-2">
                    {t?.registration_mode === "SOLO" && !canceled && !finished && latestNum === 0 ? (
                        teamsBuilt ? (
                            <button
                                disabled={teamsBusy || busy || startingMatch}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
                                onClick={resetTeams}
                                title="Удалить команды и распределение игроков"
                                type="button"
                            >
                                {teamsBusy ? <Spinner className="h-4 w-4 border-red-300 border-t-red-700" /> : null}
                                {teamsBusy ? "Сброс..." : "Сбросить команды"}
                            </button>
                        ) : (
                            <button
                                disabled={teamsBusy || busy || startingMatch}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
                                onClick={buildTeamsSolo}
                                title="Собрать команды по корзинам"
                                type="button"
                            >
                                {teamsBusy ? <Spinner className="h-4 w-4" /> : null}
                                {teamsBusy ? "Сбор..." : "Собрать команды"}
                            </button>
                        )
                    ) : null}

                    {!canceled ? (
                        <button
                            disabled={busy || !canStartNext}
                            className="rounded-xl bg-orange-600 px-3 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"
                            onClick={start}
                            title={!canStartNext ? "Чтобы стартовать следующий матч, сохрани результаты всех игр" : ""}
                            type="button"
                        >
                            {startingMatch ? (
                                <Spinner className="h-4 w-4 border-white/40 border-t-white" />
                            ) : null}
                            {!canStartNext
                                ? "Матч №" + latestNum + " в процессе..."
                                : startingMatch
                                    ? "Запуск матча..."
                                    : "Стартовать Матч №" + nextMatchNumber}
                        </button>
                    ) : null}

                    {!finished && latestNum > 0 ? (
                        <button
                            disabled={busy || !canFinish}
                            className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                            onClick={finishTournament}
                            title={!canFinish ? "Можно завершить только после внесения результатов всех игр текущего матча" : ""}
                            type="button"
                        >
                            Завершить турнир
                        </button>
                    ) : null}

                    {!canceled ? (
                        <button
                            disabled={busy || canceled || finished}
                            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                            onClick={cancelTournament}
                            type="button"
                        >
                            Отменить турнир
                        </button>
                    ) : null}

                    {me?.roles?.includes("ADMIN") && (finished || canceled) && !t?.archived_at ? (
                        <button
                            disabled={busy}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                            onClick={archiveTournament}
                            type="button"
                        >
                            Архивировать
                        </button>
                    ) : null}
                </div>

                {msg && <div className="mt-3 text-sm font-semibold text-orange-700">{msg}</div>}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="font-semibold text-slate-700">Матчи и сетка турнира</div>

                {t?.registration_mode === "SOLO" && latestNum === 0 && !canceled && !finished ? (
                    <div className="mt-5 rounded-2xl border border-slate-200 p-5">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-lg font-bold">Игроки (посев и корзины)</h2>
                                {teamsBuilt ? (
                                    <div className="mt-1 text-xs font-semibold text-slate-600">
                                        Команды уже собраны — уровни и посев заблокированы. Нажмите «Сбросить команды», чтобы изменить и собрать заново.
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-500">
                                        Посев доступен только до старта первого матча.
                                    </div>
                                )}
                            </div>
                        </div>

                        {spMsg && <div className="mt-3 text-sm font-semibold text-orange-700">{spMsg}</div>}

                        <div className="mt-4 grid gap-2">
                            {soloPlayers.length === 0 ? (
                                <div className="text-sm text-slate-600">Пока нет данных по игрокам.</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-xs font-bold text-slate-500">
                                                <th className="py-2 pr-3">#</th>
                                                <th className="py-2 pr-3">Игрок</th>
                                                <th className="py-2 pr-3">Корзина</th>
                                                <th className="py-2 pr-3">Уровень</th>
                                                <th className="py-2 pr-3">Посев</th>
                                                <th className="py-2 pr-3">Команда</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {soloPlayers.map((p, idx) => (
                                                <tr key={p.id} className="border-t border-slate-100">
                                                    <td className="py-2 pr-3 font-semibold text-slate-500">{idx + 1}</td>

                                                    <td className="py-2 pr-3">
                                                        <div className="font-semibold">{p.full_name}</div>
                                                    </td>

                                                    <td className="py-2 pr-3">
                                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                                                            {p.bucket === 1 ? "A" : p.bucket === 2 ? "B" : "C"}
                                                        </span>
                                                    </td>

                                                    <td className="py-2 pr-3">
                                                        <select
                                                            disabled={busy || startingMatch || teamsBuilt || spBusyId === p.id}
                                                            className="w-16 rounded-xl border border-slate-200 px-2 py-1 text-sm"
                                                            value={p.strength}
                                                            title="1 - самый слабый, 5 - самый сильный"
                                                            onChange={async (e) => {
                                                                const v = Number(e.target.value);

                                                                setSpBusyId(p.id);
                                                                setSpMsg(null);
                                                                try {
                                                                    const res = await adminFetch(
                                                                        `/api/admin/tournament/${tournamentId}/players/strength`,
                                                                        {
                                                                            method: "POST",
                                                                            headers: { "Content-Type": "application/json" },
                                                                            body: JSON.stringify({ playerId: p.id, strength: v }),
                                                                        }
                                                                    );
                                                                    const json = await res.json().catch(() => ({}));
                                                                    if (!res.ok) {
                                                                        setSpMsg(json?.error?.message ?? json?.error ?? "Ошибка изменения уровня");
                                                                        return;
                                                                    }
                                                                    await load();
                                                                } finally {
                                                                    setSpBusyId(null);
                                                                }
                                                            }}
                                                        >
                                                            {[1, 2, 3, 4, 5].map((x) => (
                                                                <option key={x} value={x}>
                                                                    {x}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>

                                                    <td className="py-2 pr-3">
                                                        <select
                                                            disabled={spBusyId === p.id || busy || startingMatch || teamsBuilt}
                                                            className="w-28 rounded-xl border border-slate-200 px-2 py-1 text-sm"
                                                            value={p.seed_team_index ?? ""}
                                                            onChange={(e) => {
                                                                const v = e.target.value === "" ? null : Number(e.target.value);
                                                                setSeed(p.id, v);
                                                            }}
                                                            title="Посеять игрока в команду (1..8)"
                                                        >
                                                            <option value="">—</option>
                                                            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                                                                <option key={n} value={n}>
                                                                    Команда {n}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>

                                                    <td className="py-2 pr-3">
                                                        {p.team_index ? (
                                                            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">
                                                                {p.team_index}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-slate-400">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    <div className="mt-3 text-xs text-slate-500">
                                        Посев: максимум 8 игроков, в одну команду — не более одного.
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}

                {!finished ? (
                    <div className="mt-5">
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="text-lg font-bold">Текущий матч</h2>

                            <div className="text-sm text-slate-600">
                                {state?.latestStage?.number ? `Матч №${state.latestStage.number}` : "нет"}
                            </div>
                        </div>

                        {startingMatch ? (
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6">
                                <div className="flex items-center gap-3">
                                    <Spinner className="h-5 w-5" />
                                    <div className="text-sm font-extrabold text-slate-700">
                                        Выполняется старт матча…
                                    </div>
                                </div>
                                <div className="mt-2 text-xs text-slate-500">
                                    Создаются игры и обновляется состояние турнира. Это займёт несколько секунд.
                                </div>
                            </div>
                        ) : (
                            <div className="grid gap-3 sm:grid-cols-2">
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

                                    const a = nameById.get(g.team_a_id);
                                    const b = nameById.get(g.team_b_id);
                                    const done = !!g.winner_team_id;

                                    return (
                                        <GameCard
                                            key={g.id}
                                            court={court}
                                            points={pointsForCourt(court)}
                                            teamA={{ id: g.team_a_id, name: typeof a === "string" ? a : "—" }}
                                            teamB={{ id: g.team_b_id, name: typeof b === "string" ? b : "—" }}
                                            done={done}
                                            existingWinner={g.winner_team_id}
                                            existingScore={g.score_text ?? ""}
                                            onSubmit={async (winnerId, score) => {
                                                const ok = await submitResult(g.id, winnerId, score);
                                                return ok;
                                            }}
                                            busy={busy}
                                            isFinal={g.is_final}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 p-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-extrabold text-orange-700">Итоги турнира</h2>
                            <div className="text-sm font-extrabold text-orange-700">Турнир завершён</div>
                        </div>

                        <div className="mt-4 grid gap-2">
                            {teams.map((tm: any, idx: number) => (
                                <div
                                    key={tm.id}
                                    className="flex items-center justify-between rounded-xl border border-orange-100 bg-white px-4 py-3"
                                >
                                    <div className="text-sm font-bold">
                                        <span className="mr-3 text-lg font-extrabold text-orange-600">{idx + 1}</span>
                                        {tm.name}
                                    </div>

                                    <div className="text-base font-extrabold text-orange-700">{tm.points} очк.</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </section>

            {!finished && (
                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
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
                    </div>
                </section>
            )}
        </main>
    );
}

function Spinner({ className = "" }: { className?: string }) {
    return (
        <span
            className={
                "inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-orange-600 " +
                className
            }
            aria-label="loading"
        />
    );
}

function GameCard(props: {
    court: number;
    points: number | null;
    teamA: { id: string; name: string };
    teamB: { id: string; name: string };
    done: boolean;
    existingWinner: string | null;
    existingScore: string;
    isFinal: boolean;
    onSubmit: (winnerId: string, score: string) => Promise<boolean>;
    busy: boolean;
}) {
    const [winner, setWinner] = useState<string>(props.existingWinner ?? "");
    const [score, setScore] = useState<string>(props.existingScore);
    const canSave = !!winner;
    const [savedToast, setSavedToast] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (props.existingWinner) setWinner(props.existingWinner);
        setScore(props.existingScore);
        setSavedToast(false);
        setSaving(false);
    }, [props.existingWinner, props.existingScore]);

    const resolvedWinner = props.existingWinner ?? winner;
    const winnerCourt = Math.max(1, props.court - 1);
    const loserCourt = Math.min(4, props.court + 1);

    function moveBadge(teamId: string) {
        if (!resolvedWinner) return null;

        const isWinner = resolvedWinner === teamId;
        const canMoveUp = props.court > 1;
        const canMoveDown = props.court < 4;

        if (isWinner && !canMoveUp) return null;
        if (!isWinner && !canMoveDown) return null;

        const target = isWinner ? winnerCourt : loserCourt;

        return (
            <span
                className={
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-extrabold " +
                    (isWinner ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")
                }
                title={isWinner ? "Победитель поднимается выше" : "Проигравший опускается ниже"}
            >
                {isWinner ? "↗" : "↘"} к {target}
            </span>
        );
    }

    return (
        <div
            className={
                "rounded-2xl border p-4 " + (props.done ? "border-orange-200" : "border-slate-100")
            }
        >
            <div className="flex items-center justify-between">
                <div className="font-extrabold">
                    Корт {props.court}
                    {props.points != null ? (
                        <span className="ml-2 text-xs font-bold text-slate-500">Очки: +{props.points}</span>
                    ) : null}
                </div>
                {props.done ? (
                    <div className="rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-700">
                        Игра завершена
                    </div>
                ) : (
                    <div className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                        В игре
                    </div>
                )}
            </div>

            <div className="mt-3 grid gap-2">
                <label className="text-sm font-bold text-slate-600">Выберите победителя</label>

                <div className="mt-4 flex flex-col items-center gap-3">
                    <button
                        type="button"
                        disabled={props.done || props.busy}
                        onClick={() => setWinner(props.teamA.id)}
                        className={
                            "w-full rounded-2xl border px-4 py-3 text-sm font-bold transition " +
                            (winner === props.teamA.id
                                ? "border-orange-300 bg-orange-50 text-orange-700"
                                : "border-slate-200 hover:bg-slate-50") +
                            (props.done ? " opacity-60 cursor-not-allowed" : "")
                        }
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-h-[2.75rem] flex-1">
                                <div className="line-clamp-2 break-words text-center text-sm font-bold leading-tight">
                                    {props.teamA.name}
                                </div>
                            </div>
                            <div className="shrink-0 pt-0.5">{props.done ? moveBadge(props.teamA.id) : null}</div>
                        </div>
                    </button>

                    <div className="text-xs font-extrabold tracking-widest text-slate-400">VS</div>

                    <button
                        type="button"
                        disabled={props.done || props.busy}
                        onClick={() => setWinner(props.teamB.id)}
                        className={
                            "w-full rounded-2xl border px-4 py-3 text-sm font-bold transition " +
                            (winner === props.teamB.id
                                ? "border-orange-300 bg-orange-50 text-orange-700"
                                : "border-slate-200 hover:bg-slate-50") +
                            (props.done ? " opacity-60 cursor-not-allowed" : "")
                        }
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-h-[2.75rem] flex-1">
                                <div className="line-clamp-2 break-words text-center text-sm font-bold leading-tight">
                                    {props.teamB.name}
                                </div>
                            </div>
                            <div className="shrink-0 pt-0.5">{props.done ? moveBadge(props.teamB.id) : null}</div>
                        </div>
                    </button>
                </div>

                <label className="text-sm font-bold text-slate-600">Счёт (опционально)</label>
                <input
                    disabled={props.done || props.busy}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    placeholder="6-4"
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                />

                {saving ? (
                    <div className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600">
                        <Spinner />
                        Сохранение…
                    </div>
                ) : props.done || savedToast ? (
                    <div className="mt-2 flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-500">
                        Результат сохранён
                    </div>
                ) : (
                    <button
                        disabled={!canSave || props.busy}
                        className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-3 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"
                        onClick={async () => {
                            setSaving(true);
                            try {
                                const ok = await props.onSubmit(winner, score);
                                if (ok) setSavedToast(true);
                            } finally {
                                setSaving(false);
                            }
                        }}
                        type="button"
                    >
                        Сохранить результат
                    </button>
                )}
            </div>
        </div>
    );
}