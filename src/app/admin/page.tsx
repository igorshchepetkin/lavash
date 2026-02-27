"use client";

import { useEffect, useMemo, useState } from "react";

type Tournament = {
    id: string;
    name: string;
    date: string;
    registration_mode: "TEAM" | "SOLO";
    status: "draft" | "live" | "finished";
};

export default function AdminHome() {
    const [token, setToken] = useState("");
    const [logged, setLogged] = useState(false);
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [checking, setChecking] = useState(true);

    const [name, setName] = useState("Лаваш");
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [startTime, setStartTime] = useState("17:00");
    const [mode, setMode] = useState<"TEAM" | "SOLO">("SOLO");
    const [p1, setP1] = useState(5);
    const [p2, setP2] = useState(4);
    const [p3, setP3] = useState(3);
    const [p4, setP4] = useState(2);

    type OverrideRow = { stage_number: number; points_c1: number; points_c2: number; points_c3: number; points_c4: number };

    const [overOpen, setOverOpen] = useState(false);
    const [overrides, setOverrides] = useState<OverrideRow[]>([]);

    async function login() {
        setError(null);
        const res = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
        });
        if (!res.ok) {
            setError("Неверный токен");
            return;
        }
        await loadTournaments();
    }

    async function logout() {
        await fetch("/api/admin/logout", { method: "POST" });
        setLogged(false);
        setTournaments([]);
    }

    function addOverrideRow() {
        // по умолчанию: 1 очко на всех кортах, а номер матча — следующий свободный
        const used = new Set(overrides.map((o) => o.stage_number));
        let sn = 1;
        while (used.has(sn)) sn++;

        setOverrides((prev) => [
            ...prev,
            { stage_number: sn, points_c1: 1, points_c2: 1, points_c3: 1, points_c4: 1 },
        ]);
    }

    function updateOverrideRow(idx: number, patch: Partial<OverrideRow>) {
        setOverrides((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    }

    function removeOverrideRow(idx: number) {
        setOverrides((prev) => prev.filter((_, i) => i !== idx));
    }

    async function loadTournaments() {
        setChecking(true);

        try {
            const res = await fetch("/api/admin/tournaments");

            if (res.status === 401) {
                setLogged(false);
                setTournaments([]);
                return;
            }

            if (!res.ok) {
                setError("Ошибка загрузки турниров");
                return;
            }

            const json = await res.json();
            setTournaments(json.tournaments ?? []);
            setLogged(true);
        } finally {
            setChecking(false);
        }
    }

    async function createTournament() {
        setError(null);

        const hasDup = new Set(overrides.map(o => o.stage_number)).size !== overrides.length;
        if (overOpen && hasDup) {
            setError("В особых условиях дублируется номер матча.");
            return;
        }

        const res = await fetch("/api/admin/tournaments", {
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
                overrides: overOpen ? overrides : [],
            }),
        });

        const text = await res.text(); // <-- вместо res.json()
        let json: any = null;
        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            // если вернулся HTML/пусто
        }

        if (!res.ok) {
            setError(json?.error?.message ?? json?.error ?? text?.slice(0, 200) ?? "Ошибка создания турнира");
            return;
        }

        await loadTournaments();
    }

    useEffect(() => {
        loadTournaments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const canCreate = useMemo(() => name.trim().length > 0 && !!date, [name, date]);

    return (
        <main className="min-h-screen bg-white">
            <div className="mx-auto max-w-5xl px-4 py-8">
                <h1 className="text-2xl font-extrabold tracking-tight">
                    Админка “Лаваш”
                    <span className="ml-2 text-orange-600">MVP</span>
                </h1>

                {checking ? (
                    <section className="mt-6 rounded-2xl border border-slate-200 p-6 text-center">
                        <div className="flex justify-center py-6">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-600 border-t-transparent"></div>
                        </div>
                    </section>
                ) : !logged ? (
                    <section className="mt-6 rounded-2xl border border-slate-200 p-5">
                        <h2 className="text-lg font-bold">Вход по токену</h2>
                        <p className="mt-1 text-sm text-slate-600">
                            Вставь ADMIN_TOKEN (из .env.local).
                        </p>

                        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                            <input
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                placeholder="ADMIN_TOKEN"
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                            />
                            <button
                                className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700"
                                onClick={login}
                            >
                                Войти
                            </button>
                        </div>

                        {error && <div className="mt-3 text-sm font-semibold text-red-600">{error}</div>}
                    </section>
                ) : (
                    <>
                        <section className="mt-6 rounded-2xl border border-slate-200 p-5">
                            <h2 className="text-lg font-bold">Создать турнир</h2>

                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                                <label className="text-sm">
                                    <div className="mb-1 font-semibold text-slate-700">Название</div>
                                    <input
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                </label>

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.2fr_0.8fr]">
                                    <label className="text-sm">
                                        <div className="mb-1 font-semibold text-slate-700">Дата</div>
                                        <input
                                            type="date"
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2"
                                            value={date}
                                            onChange={(e) => setDate(e.target.value)}
                                        />
                                    </label>

                                    <label className="text-sm">
                                        <div className="mb-1 font-semibold text-slate-700">Время начала</div>
                                        <input
                                            type="time"
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2"
                                            value={startTime}
                                            onChange={(e) => setStartTime(e.target.value)}
                                        />
                                    </label>
                                </div>

                                <label className="text-sm">
                                    <div className="mb-1 font-semibold text-slate-700">Режим заявок</div>
                                    <select
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2"
                                        value={mode}
                                        onChange={(e) => setMode(e.target.value as any)}
                                    >
                                        <option value="SOLO">SOLO (по одному игроку)</option>
                                        <option value="TEAM">TEAM (сразу команда 3 человека)</option>
                                    </select>
                                </label>

                                <div className="text-sm">
                                    <div className="mb-1 font-semibold text-slate-700">Очки за корты</div>
                                    <div className="grid grid-cols-4 gap-2">
                                        {[p1, p2, p3, p4].map((v, i) => (
                                            <input
                                                key={i}
                                                type="number"
                                                className="rounded-xl border border-slate-200 px-3 py-2"
                                                value={v}
                                                onChange={(e) => {
                                                    const n = Number(e.target.value);
                                                    if (i === 0) setP1(n);
                                                    if (i === 1) setP2(n);
                                                    if (i === 2) setP3(n);
                                                    if (i === 3) setP4(n);
                                                }}
                                            />
                                        ))}
                                    </div>
                                    <div className="mt-1 text-xs text-slate-500">c1..c4</div>
                                    <div className="text-sm">
                                        <div className="mb-1 flex items-center justify-between">
                                            <div className="font-semibold text-slate-700">Особые очки по матчам</div>
                                            <button
                                                type="button"
                                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                                                onClick={() => setOverOpen((v) => !v)}
                                            >
                                                {overOpen ? "Свернуть" : "Настроить"}
                                            </button>
                                        </div>

                                        <div className="text-xs text-slate-500">
                                            Можно задать другие очки для отдельных матчей. Например, для первого матча всем по 1 очку.
                                        </div>

                                        {overOpen && (
                                            <div className="mt-3 rounded-2xl border border-slate-200 p-4">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="text-sm font-extrabold">Настройки по матчам</div>
                                                    <button
                                                        type="button"
                                                        className="rounded-xl bg-orange-600 px-3 py-2 text-sm font-bold text-white hover:bg-orange-700"
                                                        onClick={addOverrideRow}
                                                    >
                                                        + Матч
                                                    </button>
                                                </div>

                                                {overrides.length === 0 ? (
                                                    <div className="mt-3 text-sm text-slate-600">
                                                        Пока нет особых условий.
                                                    </div>
                                                ) : (
                                                    <div className="mt-3 grid gap-2">
                                                        {overrides
                                                            .slice()
                                                            .sort((a, b) => a.stage_number - b.stage_number)
                                                            .map((row, idxSorted) => {
                                                                // idxSorted — индекс в отсортированном массиве.
                                                                // Нам нужен индекс в исходном overrides, иначе update/remove попадёт не туда.
                                                                const idx = overrides.findIndex((x) => x.stage_number === row.stage_number && x.points_c1 === row.points_c1 && x.points_c2 === row.points_c2 && x.points_c3 === row.points_c3 && x.points_c4 === row.points_c4);

                                                                const duplicate = overrides.filter((o) => o.stage_number === row.stage_number).length > 1;
                                                                const badSn = !Number.isFinite(row.stage_number) || row.stage_number < 1;

                                                                return (
                                                                    <div key={`${row.stage_number}-${idxSorted}`} className="rounded-2xl border border-slate-100 p-3">
                                                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                                            <div className="flex flex-wrap items-center gap-2">
                                                                                <div className="text-sm font-bold">Матч №</div>
                                                                                <input
                                                                                    type="number"
                                                                                    min={1}
                                                                                    className={"w-24 rounded-xl border px-3 py-2 text-sm " + ((duplicate || badSn) ? "border-red-300" : "border-slate-200")}
                                                                                    value={row.stage_number}
                                                                                    onChange={(e) => updateOverrideRow(idx, { stage_number: Number(e.target.value) })}
                                                                                />

                                                                                {(duplicate || badSn) ? (
                                                                                    <div className="text-xs font-semibold text-red-600">
                                                                                        {badSn ? "Номер матча должен быть ≥ 1" : "Дублируется номер матча"}
                                                                                    </div>
                                                                                ) : null}
                                                                            </div>

                                                                            <button
                                                                                type="button"
                                                                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                                                                                onClick={() => removeOverrideRow(idx)}
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

                                                <div className="mt-3 text-xs text-slate-500">
                                                    Совет: для “первые 2 матча по 1 очку” добавь Матч №1 и Матч №2 и выставь c1..c4 = 1.
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <button
                                disabled={!canCreate}
                                className="mt-4 rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                                onClick={createTournament}
                            >
                                Создать
                            </button>

                            {error && <div className="mt-3 text-sm font-semibold text-red-600">{error}</div>}
                        </section>

                        <section className="mt-6 rounded-2xl border border-slate-200 p-5">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-bold">Турниры</h2>
                                <div className="flex gap-2">
                                    <button
                                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                                        onClick={loadTournaments}
                                    >
                                        Обновить
                                    </button>
                                    <button
                                        className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100"
                                        onClick={logout}
                                    >
                                        Выход
                                    </button>
                                </div>
                            </div>
                            <div className="mt-4 grid gap-3">
                                {tournaments.map((t) => (
                                    <div key={t.id} className="rounded-2xl border border-slate-100 p-4">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                            <div>
                                                <div className="font-extrabold">{t.name}</div>
                                                <div className="text-sm text-slate-600">
                                                    {t.date}· {t.start_time} · {t.registration_mode} ·{" "}
                                                    <span className="font-semibold text-orange-600">{t.status}</span>
                                                </div>
                                            </div>

                                            <div className="flex gap-2">
                                                <a
                                                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                                                    href={`/admin/t/${t.id}/registrations`}
                                                >
                                                    Заявки
                                                </a>
                                                <a
                                                    className="rounded-xl bg-orange-600 px-3 py-2 text-sm font-bold text-white hover:bg-orange-700"
                                                    href={`/admin/t/${t.id}/ops`}
                                                >
                                                    Судья
                                                </a>
                                                <a
                                                    className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100"
                                                    href={`/t/${t.id}`}
                                                    target="_blank"
                                                >
                                                    Витрина
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {tournaments.length === 0 && (
                                    <div className="text-sm text-slate-600">Пока нет турниров.</div>
                                )}
                            </div>
                        </section>
                    </>
                )}
            </div>
        </main>
    );
}