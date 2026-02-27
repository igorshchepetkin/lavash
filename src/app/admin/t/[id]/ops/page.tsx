"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type StatePayload = any;

export default function OpsPage() {
    const params = useParams<{ id: string }>();
    const tournamentId = params.id;

    const [state, setState] = useState<StatePayload | null>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const [teamsBusy, setTeamsBusy] = useState(false);

    const [startingMatch, setStartingMatch] = useState(false);

    type OverrideRow = { stage_number: number; points_c1: number; points_c2: number; points_c3: number; points_c4: number };

    const [overrides, setOverrides] = useState<OverrideRow[]>([]);
    const [ovBusy, setOvBusy] = useState(false);
    const [ovMsg, setOvMsg] = useState<string | null>(null);

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

    const [soloPlayers, setSoloPlayers] = useState<SoloPlayerRow[]>([]);
    const [spBusyId, setSpBusyId] = useState<string | null>(null);
    const [spMsg, setSpMsg] = useState<string | null>(null);

    async function load() {
        const res = await fetch(`/api/admin/tournament/${tournamentId}/state`);
        const json = await res.json();
        setState(json);

        const resO = await fetch(`/api/admin/tournament/${tournamentId}/points-overrides`);
        const jsonO = await resO.json();
        setOverrides(jsonO.overrides ?? []);

        // SOLO players list (for seeding UI)
        const resP = await fetch(`/api/admin/tournament/${tournamentId}/solo-players`);
        const jsonP = await resP.json();
        if (!resP.ok || !jsonP?.ok) {
            setSpMsg(jsonP?.error?.message ?? jsonP?.error ?? "Ошибка загрузки списка игроков");
            setSoloPlayers([]);
        } else {
            setSoloPlayers(jsonP.players ?? []);
        }
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
    const canEditOverrides = !canceled && !finished && latestNum === 0; // ещё нет матчей

    // Можно стартовать следующий матч если:
    // - турнир не отменён/не завершён
    // - либо матчей ещё не было (latestNum == 0)
    // - либо предыдущий матч завершён (все 4 результата внесены)
    const canStartNext =
        !canceled &&
        !finished &&
        (latestNum === 0 || stageComplete);

    const canFinish =
        !canceled && !finished && latestNum > 0 && stageComplete;

    const nameById = useMemo(() => new Map(teams.map((x: any) => [x.id, x.name])), [teams]);

    const teamsBuilt = (teams?.length ?? 0) > 0;

    const overridesHasErrors = (() => {
        const sn = overrides.map(o => o.stage_number);
        if (new Set(sn).size !== sn.length) return true;
        for (const o of overrides) {
            if (!Number.isFinite(o.stage_number) || o.stage_number < 1) return true;
        }
        return false;
    })();
    const canSaveOverrides = overrides.length > 0 && !overridesHasErrors;

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
            const res = await fetch(`/api/admin/tournament/${tournamentId}/solo-players/seed`, {
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
            const res = await fetch(`/api/admin/tournament/${tournamentId}/build-teams`, {
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
            const res = await fetch(`/api/admin/tournament/${tournamentId}/reset-teams`, {
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
        setBusy(true); setMsg(null);
        setStartingMatch(true);

        try {
            const res = await fetch(`/api/admin/tournament/${tournamentId}/start`, {
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

        setBusy(true); setMsg(null);
        try {
            const res = await fetch(`/api/admin/tournament/${tournamentId}/cancel`, { method: "POST" });
            const json = await res.json();
            if (!res.ok) setMsg(json?.error ?? "Ошибка");
            else setMsg("Турнир отменён.");
            await load();
        } finally {
            setBusy(false);
        }
    }

    async function submitResult(gameId: string, winnerTeamId: string, scoreText: string): Promise<boolean> {
        setBusy(true); setMsg(null);
        try {
            const res = await fetch(`/api/admin/tournament/${tournamentId}/game/result`, {
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
            const res = await fetch(`/api/admin/tournament/${tournamentId}/finish`, { method: "POST" });
            const json = await res.json();
            if (!res.ok) setMsg(json?.error ?? "Ошибка завершения");
            await load();
        } finally {
            setBusy(false);
        }
    }

    function addOverrideRow() {
        const used = new Set(overrides.map((o) => o.stage_number));
        let sn = 1;
        while (used.has(sn)) sn++;
        setOverrides((prev) => [...prev, { stage_number: sn, points_c1: 1, points_c2: 1, points_c3: 1, points_c4: 1 }]);
    }

    function updateOverrideRow(idx: number, patch: Partial<OverrideRow>) {
        setOverrides((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    }

    function removeOverrideRow(idx: number) {
        setOverrides((prev) => prev.filter((_, i) => i !== idx));
    }

    async function saveOverrides() {
        setOvBusy(true); setOvMsg(null);
        try {
            // простая валидация дублей
            const sn = overrides.map(o => o.stage_number);
            if (new Set(sn).size !== sn.length) {
                setOvMsg("Дублируется номер матча в особых условиях.");
                return;
            }

            const res = await fetch(`/api/admin/tournament/${tournamentId}/points-overrides`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ overrides }),
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setOvMsg(json?.error?.message ?? json?.error ?? "Ошибка сохранения условий");
                return;
            }

            setOvMsg("Особые условия сохранены.");
            await load();
        } finally {
            setOvBusy(false);
        }
    }

    return (
        <main className="min-h-screen bg-white">
            <div className="mx-auto max-w-5xl px-4 py-8">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-extrabold tracking-tight">Судья</h1>
                    <div className="flex gap-2">
                        <a className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50" href="/admin">
                            ← Турниры
                        </a>
                        <button className="rounded-xl bg-orange-600 px-3 py-2 text-sm font-bold text-white hover:bg-orange-700" onClick={load}>
                            Обновить
                        </button>
                    </div>
                </div>

                <section className="mt-6 rounded-2xl border border-slate-200 p-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="text-lg font-extrabold">{t?.name}</div>
                            <div className="text-sm text-slate-600">
                                {t?.date} · режим: <b className="text-orange-600">{t?.registration_mode}</b> · статус:{" "}
                                <b className="text-orange-600">{t?.status}</b>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {t?.registration_mode === "SOLO" && !canceled && !finished && latestNum === 0 ? (
                                teamsBuilt ? (
                                    <button
                                        disabled={teamsBusy || busy || startingMatch}
                                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-2"
                                        onClick={resetTeams}
                                        title="Удалить команды и распределение игроков"
                                    >
                                        {teamsBusy ? <Spinner className="h-4 w-4 border-red-300 border-t-red-700" /> : null}
                                        {teamsBusy ? "Сброс..." : "Сбросить команды"}
                                    </button>
                                ) : (
                                    <button
                                        disabled={teamsBusy || busy || startingMatch}
                                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-2"
                                        onClick={buildTeamsSolo}
                                        title="Собрать команды по корзинам"
                                    >
                                        {teamsBusy ? <Spinner className="h-4 w-4" /> : null}
                                        {teamsBusy ? "Сбор..." : "Собрать команды"}
                                    </button>
                                )
                            ) : null}

                            <button
                                disabled={busy || !canStartNext}
                                className="rounded-xl bg-orange-600 px-3 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"
                                onClick={start}
                                title={!canStartNext ? "Чтобы стартовать следующий матч, сохрани результаты всех игр" : ""}
                            >
                                {startingMatch ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : null}
                                {!canStartNext ? "Матч №" + latestNum + " в процессе..." : (startingMatch ? "Матч запускается..." : "Стартовать Матч №" + nextMatchNumber)}
                            </button>

                            {!finished && latestNum > 0 ? (
                                <button
                                    disabled={busy || !canFinish}
                                    className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                                    onClick={finishTournament}
                                    title={!canFinish ? "Можно завершить только после внесения результатов всех игр текущего матча" : ""}
                                >
                                    Завершить турнир
                                </button>
                            ) : []}

                            <button
                                disabled={busy || canceled || finished}
                                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                                onClick={cancelTournament}
                            >
                                Отменить турнир
                            </button>
                        </div>
                    </div>

                    {msg && <div className="mt-3 text-sm font-semibold text-orange-700">{msg}</div>}
                </section>

                {canEditOverrides && (
                    <section className="mt-6 rounded-2xl border border-slate-200 p-5">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-lg font-bold">Особые очки по матчам</h2>
                                <div className="text-xs text-slate-500">
                                    Можно задать другие очки для отдельных матчей. Например, для первого матча всем по 1 очку.
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    disabled={ovBusy}
                                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
                                    onClick={addOverrideRow}
                                >
                                    + Добавить матч
                                </button>

                                <button
                                    disabled={ovBusy || !canSaveOverrides}
                                    className="rounded-xl bg-orange-600 px-3 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"
                                    onClick={saveOverrides}
                                >
                                    {ovBusy ? "Сохраняю..." : "Сохранить"}
                                </button>
                            </div>
                        </div>

                        {ovMsg && <div className="mt-3 text-sm font-semibold text-orange-700">{ovMsg}</div>}

                        {overrides.length === 0 ? (
                            <div className="mt-4 text-sm text-slate-600">Пока нет особых условий.</div>
                        ) : (
                            <div className="mt-4 grid gap-2">
                                {overrides.map((row, idx) => {
                                    const dup = overrides.filter((o) => o.stage_number === row.stage_number).length > 1;
                                    const badSn = !Number.isFinite(row.stage_number) || row.stage_number < 1;

                                    return (
                                        <div key={idx} className="rounded-2xl border border-slate-100 p-4">
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <div className="text-sm font-bold">Матч №</div>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        className={"w-24 rounded-xl border px-3 py-2 text-sm " + ((dup || badSn) ? "border-red-300" : "border-slate-200")}
                                                        value={row.stage_number}
                                                        onChange={(e) => updateOverrideRow(idx, { stage_number: Number(e.target.value) })}
                                                    />
                                                    {(dup || badSn) ? (
                                                        <div className="text-xs font-semibold text-red-600">
                                                            {badSn ? "Номер матча должен быть ≥ 1" : "Дублируется номер матча"}
                                                        </div>
                                                    ) : null}
                                                </div>

                                                <button
                                                    disabled={ovBusy}
                                                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
                                                    onClick={() => removeOverrideRow(idx)}
                                                >
                                                    Удалить
                                                </button>
                                            </div>

                                            <div className="mt-3">
                                                <div className="text-xs font-semibold text-slate-600">Очки за корты (c1..c4)</div>
                                                <div className="mt-1 grid grid-cols-4 gap-2">
                                                    {[row.points_c1, row.points_c2, row.points_c3, row.points_c4].map((v, i) => (
                                                        <input
                                                            key={i}
                                                            type="number"
                                                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                                            value={v}
                                                            onChange={(e) => {
                                                                const n = Number(e.target.value);
                                                                if (i === 0) updateOverrideRow(idx, { points_c1: n });
                                                                if (i === 1) updateOverrideRow(idx, { points_c2: n });
                                                                if (i === 2) updateOverrideRow(idx, { points_c3: n });
                                                                if (i === 3) updateOverrideRow(idx, { points_c4: n });
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                )}

                {t?.registration_mode === "SOLO" && latestNum === 0 && !canceled && !finished ? (
                    <section className="mt-6 rounded-2xl border border-slate-200 p-5">
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
                                                                    const res = await fetch(`/api/admin/tournament/${tournamentId}/players/strength`, {
                                                                        method: "POST",
                                                                        headers: { "Content-Type": "application/json" },
                                                                        body: JSON.stringify({ playerId: p.id, strength: v }),
                                                                    });
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
                                                            {[1, 2, 3, 4, 5].map(x => <option key={x} value={x}>{x}</option>)}
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
                                                            {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
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
                    </section>
                ) : null}

                {!finished ? (

                    /* ===== ТЕКУЩИЙ МАТЧ ===== */
                    <section className="mt-6 rounded-2xl border border-slate-200 p-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold">Текущий матч</h2>

                            <div className="text-sm text-slate-600">
                                {state?.latestStage?.number
                                    ? `Матч №${state.latestStage.number}`
                                    : "нет"}
                            </div>
                        </div>

                        <div className="mt-4">
                            {startingMatch ? (
                                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6">
                                    <div className="flex items-center gap-3">
                                        <Spinner className="h-5 w-5" />
                                        <div className="text-sm font-extrabold text-slate-700">Выполняется старт матча…</div>
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
                    </section>

                ) : (

                    /* ===== ИТОГИ ТУРНИРА ===== */
                    <section className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-extrabold text-orange-700">
                                Итоги турнира
                            </h2>
                            <div className="text-sm font-extrabold text-orange-700">
                                Турнир завершён
                            </div>
                        </div>

                        <div className="mt-4 grid gap-2">
                            {teams.map((tm: any, idx: number) => (
                                <div
                                    key={tm.id}
                                    className="flex items-center justify-between rounded-xl border border-orange-100 bg-white px-4 py-3"
                                >
                                    <div className="text-sm font-bold">
                                        <span className="mr-3 text-lg font-extrabold text-orange-600">
                                            {idx + 1}
                                        </span>
                                        {tm.name}
                                    </div>

                                    <div className="text-base font-extrabold text-orange-700">
                                        {tm.points} очк.
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                )}

                {!finished && (
                    <section className="mt-6 rounded-2xl border border-slate-200 p-5">
                        <h2 className="text-lg font-bold">Команды (очки)</h2>
                        <div className="mt-3 grid gap-2">
                            {teams.map((tm: any, idx: number) => (
                                <div
                                    key={tm.id}
                                    className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2"
                                >
                                    <div className="text-sm font-semibold">
                                        <span className="mr-2 font-extrabold text-orange-600">
                                            {idx + 1}
                                        </span>
                                        {tm.name}
                                    </div>
                                    <div className="text-sm font-bold">{tm.points}</div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </div>
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

    const showMoveA =
        !!resolvedWinner &&
        (
            (resolvedWinner === props.teamA.id && props.court > 1) ||
            (resolvedWinner !== props.teamA.id && props.court < 4)
        );

    const showMoveB =
        !!resolvedWinner &&
        (
            (resolvedWinner === props.teamB.id && props.court > 1) ||
            (resolvedWinner !== props.teamB.id && props.court < 4)
        );

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
                    "ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-extrabold " +
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
                "rounded-2xl border p-4 " +
                (props.done ? "border-orange-200" : "border-slate-100")
            }
        >
            <div className="flex items-center justify-between">
                <div className="font-extrabold">Корт {props.court}
                    {props.points != null ? (
                        <span className="ml-2 text-xs font-bold text-slate-500">
                            (+{props.points} очков)
                        </span>
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

                    {/* КНОПКА КОМАНДЫ A */}
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
                        {props.teamA.name}
                        {props.done ? moveBadge(props.teamA.id) : null}
                    </button>

                    {/* VS */}
                    <div className="text-xs font-extrabold text-slate-400 tracking-widest">
                        VS
                    </div>

                    {/* КНОПКА КОМАНДЫ B */}
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
                        {props.teamB.name}
                        {props.done ? moveBadge(props.teamB.id) : null}
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
                ) : (props.done || savedToast) ? (
                    <div className="mt-2 flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-500">
                        Результат сохранён
                    </div>
                ) : (
                    <button
                        disabled={!canSave || props.busy}
                        className="mt-2 rounded-xl bg-orange-600 px-3 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                        onClick={async () => {
                            setSaving(true);
                            try {
                                const ok = await props.onSubmit(winner, score);
                                if (ok) setSavedToast(true);
                            } finally {
                                setSaving(false);
                            }
                        }}
                    >
                        Сохранить результат
                    </button>
                )}
            </div>
        </div>
    );
}