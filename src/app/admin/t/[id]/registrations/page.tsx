"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Registration = any;

export default function RegistrationsPage() {
    const params = useParams<{ id: string }>();
    const tournamentId = params.id;

    const [tournament, setTournament] = useState<any>(null);
    const [regs, setRegs] = useState<Registration[]>([]);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [payBusyKey, setPayBusyKey] = useState<string | null>(null);

    const [flags, setFlags] = useState<any>(null);
    const [payments, setPayments] = useState<any[]>([]);

    async function load() {
        const res = await fetch(`/api/admin/tournament/${tournamentId}/registrations`);
        const json = await res.json();
        setTournament(json.tournament ?? []);
        setRegs(json.registrations ?? []);
        setFlags(json.flags ?? null);
        setPayments(json.payments ?? []);
    }

    async function act(registrationId: string, action: "accept" | "reject" | "unaccept") {
        setBusyId(registrationId);
        try {
            await fetch(`/api/admin/tournament/${tournamentId}/registrations`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ registrationId, action }),
            });
            await load();
        } finally {
            setBusyId(null);
        }
    }

    useEffect(() => {
        if (tournamentId) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tournamentId]);

    const pendingCount = regs.filter((r) => r.status === "pending").length;
    const acceptedCount = regs.filter((r) => r.status === "accepted").length;

    const limit =
        tournament?.registration_mode === "SOLO" ? 24 :
            tournament?.registration_mode === "TEAM" ? 8 : null;

    const started = !!flags?.started;
    const canceled = tournament?.status === "canceled";
    const finished = tournament?.status === "finished";

    // заявки нельзя трогать, если турнир отменён/завершён или уже стартовал первый матч
    const regsLocked = canceled || finished || started;

    // показывать форму добавления только если НЕ locked
    const canAddRegistration = !regsLocked;

    // --- Add Registration form state ---
    const [addOpen, setAddOpen] = useState(false);
    const [addBusy, setAddBusy] = useState(false);
    const [addErr, setAddErr] = useState<string | null>(null);
    const [addOk, setAddOk] = useState<string | null>(null);

    // SOLO fields
    const [soloLast, setSoloLast] = useState("");
    const [soloFirst, setSoloFirst] = useState("");
    const [soloPhone, setSoloPhone] = useState("+");

    // TEAM fields
    const [teamP1, setTeamP1] = useState("");
    const [teamP2, setTeamP2] = useState("");
    const [teamP3, setTeamP3] = useState("");
    const [teamPhone, setTeamPhone] = useState("+");

    function resetAddForm() {
        setAddErr(null);
        setAddOk(null);
        setSoloLast("");
        setSoloFirst("");
        setSoloPhone("+");
        setTeamP1("");
        setTeamP2("");
        setTeamP3("");
        setTeamPhone("+");
    }

    async function submitAddRegistration() {
        if (!tournament) return;
        setAddErr(null);
        setAddOk(null);
        setAddBusy(true);

        try {
            const isSolo = tournament.registration_mode === "SOLO";

            const body = isSolo
                ? { solo_last_name: soloLast, solo_first_name: soloFirst, phone: soloPhone }
                : { team_player1: teamP1, team_player2: teamP2, team_player3: teamP3, phone: teamPhone };

            const res = await fetch(`/api/admin/tournament/${tournamentId}/registrations/create`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const text = await res.text();
            const json = text ? JSON.parse(text) : null;

            if (!res.ok) {
                setAddErr(json?.error?.message ?? json?.error ?? "Ошибка добавления заявки");
                return;
            }

            const code = json?.confirmation_code ?? null;
            setAddOk(code ? `Заявка добавлена. Код подтверждения: ${code}` : "Заявка добавлена.");
            resetAddForm();
            await load();
        } finally {
            setAddBusy(false);
        }
    }

    const payByReg = useMemo(() => {
        const m = new Map<string, Map<number, boolean>>();
        for (const p of payments) {
            const mm = m.get(p.registration_id) ?? new Map<number, boolean>();
            mm.set(p.slot, !!p.paid);
            m.set(p.registration_id, mm);
        }
        return m;
    }, [payments]);

    function paidCountForReg(r: any) {
        const mm = payByReg.get(r.id) ?? new Map<number, boolean>();
        if (r.mode === "SOLO") return mm.get(1) ? 1 : 0;
        return [1, 2, 3].filter(s => mm.get(s)).length;
    }

    function fullyPaid(r: any) {
        const c = paidCountForReg(r);
        return r.mode === "SOLO" ? c === 1 : c === 3;
    }

    async function setPaid(registrationId: string, slot: number, paid: boolean) {
        await fetch(`/api/admin/tournament/${tournamentId}/registrations/payment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ registrationId, slot, paid }),
        });
        await load();
    }

    async function setPaidWithSpinner(regId: string, slot: number, paid: boolean) {
        const key = `${regId}:${slot}`;
        setPayBusyKey(key);
        try {
            await setPaid(regId, slot, paid);
        } finally {
            setPayBusyKey(null);
        }
    }

    const paidAcceptedCount = regs.filter(r => r.status === "accepted" && fullyPaid(r)).length;

    return (
        <main className="min-h-screen bg-white">
            <div className="mx-auto max-w-5xl px-4 py-8">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-extrabold">Заявки</h1>


                    <div className="flex gap-2">
                        <a className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50" href="/admin">
                            ← Турниры
                        </a>
                        <button className="rounded-xl bg-orange-600 px-3 py-2 text-sm font-bold text-white hover:bg-orange-700" onClick={load}>
                            Обновить
                        </button>
                    </div>
                </div>
                <div className="flex items-center justify-between">
                    {tournament && (
                        <div className="mt-2 rounded-2xl border border-slate-200 p-4">
                            <div className="font-bold">{tournament.name}</div>
                            <div className="text-sm text-slate-600">
                                {tournament.date}{tournament.start_time ? ` · ${tournament.start_time}` : ""} ·{" "}
                                <b className="text-orange-600">{tournament.registration_mode}</b> · статус:{" "}
                                <b className={tournament.status === "canceled" ? "text-red-700" : "text-orange-600"}>{tournament.status}</b>
                            </div>
                        </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                            На рассмотрении: {pendingCount}
                        </div>
                        {limit && (
                            <div className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
                                Принято: {acceptedCount} из {limit}
                            </div>
                        )}
                        <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                            Сделаны взносы: {paidAcceptedCount}
                        </div>
                    </div>
                </div>

                <section className="mt-6 rounded-2xl border border-slate-200 p-5">
                    {canAddRegistration && (
                        <div className="mt-6 rounded-2xl border border-slate-200 p-4">
                            {/* --- Add Registration (Admin) --- */}
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <div className="text-base font-extrabold">Добавить заявку</div>
                                    <div className="text-xs text-slate-500">
                                        Судья может добавить игрока/команду вручную.
                                    </div>
                                </div>

                                <button
                                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                                    onClick={() => {
                                        setAddErr(null);
                                        setAddOk(null);
                                        setAddOpen((v) => !v);
                                    }}
                                >
                                    {addOpen ? "Свернуть" : "Добавить"}
                                </button>
                            </div>

                            {addOpen && (
                                <div className="mt-4">
                                    {tournament?.registration_mode === "SOLO" ? (
                                        <div className="grid gap-3 sm:grid-cols-3">
                                            <label className="text-sm">
                                                <div className="mb-1 font-semibold text-slate-700">Фамилия</div>
                                                <input
                                                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                                                    value={soloLast}
                                                    onChange={(e) => setSoloLast(e.target.value)}
                                                    placeholder="Иванов"
                                                />
                                            </label>

                                            <label className="text-sm">
                                                <div className="mb-1 font-semibold text-slate-700">Имя</div>
                                                <input
                                                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                                                    value={soloFirst}
                                                    onChange={(e) => setSoloFirst(e.target.value)}
                                                    placeholder="Иван"
                                                />
                                            </label>

                                            <label className="text-sm">
                                                <div className="mb-1 font-semibold text-slate-700">Телефон заявителя</div>
                                                <input
                                                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                                                    value={soloPhone}
                                                    onChange={(e) => setSoloPhone(e.target.value)}
                                                    placeholder="+7..."
                                                />
                                            </label>
                                        </div>
                                    ) : (
                                        <div className="grid gap-3">
                                            <div className="grid gap-3 sm:grid-cols-3">
                                                <label className="text-sm">
                                                    <div className="mb-1 font-semibold text-slate-700">Игрок 1 (ФИО)</div>
                                                    <input
                                                        className="w-full rounded-xl border border-slate-200 px-3 py-2"
                                                        value={teamP1}
                                                        onChange={(e) => setTeamP1(e.target.value)}
                                                        placeholder="Иванов Иван"
                                                    />
                                                </label>

                                                <label className="text-sm">
                                                    <div className="mb-1 font-semibold text-slate-700">Игрок 2 (ФИО)</div>
                                                    <input
                                                        className="w-full rounded-xl border border-slate-200 px-3 py-2"
                                                        value={teamP2}
                                                        onChange={(e) => setTeamP2(e.target.value)}
                                                        placeholder="Петров Пётр"
                                                    />
                                                </label>

                                                <label className="text-sm">
                                                    <div className="mb-1 font-semibold text-slate-700">Игрок 3 (ФИО)</div>
                                                    <input
                                                        className="w-full rounded-xl border border-slate-200 px-3 py-2"
                                                        value={teamP3}
                                                        onChange={(e) => setTeamP3(e.target.value)}
                                                        placeholder="Сидоров Семён"
                                                    />
                                                </label>
                                            </div>

                                            <label className="text-sm sm:max-w-sm">
                                                <div className="mb-1 font-semibold text-slate-700">Телефон заявителя команды</div>
                                                <input
                                                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                                                    value={teamPhone}
                                                    onChange={(e) => setTeamPhone(e.target.value)}
                                                    placeholder="+7..."
                                                />
                                            </label>
                                        </div>
                                    )}

                                    {addErr && (
                                        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                                            {addErr}
                                        </div>
                                    )}

                                    {addOk && (
                                        <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">
                                            {addOk}
                                        </div>
                                    )}

                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <button
                                            disabled={addBusy}
                                            className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"
                                            onClick={submitAddRegistration}
                                        >
                                            {addBusy ? "Добавляю..." : "Добавить заявку"}
                                        </button>

                                        <button
                                            disabled={addBusy}
                                            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
                                            onClick={() => {
                                                resetAddForm();
                                                setAddOpen(false);
                                            }}
                                        >
                                            Отмена
                                        </button>
                                    </div>

                                    <div className="mt-2 text-xs text-slate-500">
                                        Код подтверждения появится после добавления.
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        Уровень игрока в режиме SOLO по умолчанию будет <b>3</b> (потом можно поменять).
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="mt-4 grid gap-3">
                        {started && (
                            <div className="mb-4 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm font-semibold text-orange-700">
                                Турнир уже стартовал — заявки заблокированы (нельзя добавлять/принимать/отклонять/снимать принятие).
                            </div>
                        )}

                        {regs.map((r) => {
                            const title =
                                r.mode === "SOLO"
                                    ? r.solo_player
                                    : [r.team_player1, r.team_player2, r.team_player3].filter(Boolean).join(" / ");

                            return (
                                <div
                                    key={r.id}
                                    className={
                                        "rounded-2xl border p-4 " +
                                        (r.status === "accepted" && fullyPaid(r)
                                            ? "border-orange-200 bg-orange-50/30"
                                            : "border-slate-100")
                                    }
                                >
                                    {/* HEADER ROW: LEFT | LEVEL | ACTIONS (fixed columns on sm+) */}
                                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_16rem] sm:items-center">
                                        {/* LEFT */}
                                        <div className="min-w-0">
                                            <div className="font-bold">{title}</div>

                                            <div className="text-sm text-slate-600">
                                                {r.phone ? (
                                                    <>
                                                        тел: <b>{r.phone}</b> ·{" "}
                                                    </>
                                                ) : null}
                                                статус: <span className="font-semibold text-orange-600">{r.status}</span>

                                                {r.mode === "TEAM" && r.status === "accepted" ? (
                                                    <>
                                                        {" "}
                                                        · взнос:{" "}
                                                        <b className={fullyPaid(r) ? "text-emerald-700" : "text-slate-700"}>
                                                            {paidCountForReg(r)}/3
                                                        </b>
                                                    </>
                                                ) : null}
                                            </div>
                                        </div>

                                        {/* LEVEL (fixed start position) */}
                                        <div className="flex items-center justify-start gap-2 sm:justify-start">
                                            {(r.status !== "withdrawn" && tournament?.status === "draft") ? (
                                                <>
                                                    <div className="w-20 text-right text-xs font-semibold text-slate-600">Уровень:</div>
                                                    <select
                                                        className="w-16 rounded-xl border border-slate-200 px-2 py-1 text-sm"
                                                        value={r.strength ?? 3}
                                                        title="1 - самый слабый, 5 - самый сильный"
                                                        onChange={async (e) => {
                                                            const v = Number(e.target.value);
                                                            await fetch(`/api/admin/tournament/${tournamentId}/registrations/strength`, {
                                                                method: "POST",
                                                                headers: { "Content-Type": "application/json" },
                                                                body: JSON.stringify({ registrationId: r.id, strength: v }),
                                                            });
                                                            await load();
                                                        }}
                                                    >
                                                        {[1, 2, 3, 4, 5].map((x) => (
                                                            <option key={x} value={x}>
                                                                {x}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </>
                                            ) : (
                                                // чтобы колонка уровня не “схлопывалась” и сетка визуально была стабильной
                                                <div className="h-9" />
                                            )}
                                        </div>

                                        {/* ACTIONS (fixed start position + right aligned) */}
                                        <div className="flex flex-wrap items-center justify-end gap-2 sm:flex-nowrap sm:justify-self-stretch">
                                            {r.status === "pending" ? (
                                                <>
                                                    <button
                                                        disabled={busyId === r.id || regsLocked}
                                                        className="rounded-xl bg-orange-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                                                        onClick={() => act(r.id, "accept")}
                                                    >
                                                        Принять
                                                    </button>

                                                    <button
                                                        disabled={busyId === r.id || regsLocked}
                                                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
                                                        onClick={() => {
                                                            const hasAnyPaid = paidCountForReg(r) > 0;
                                                            if (hasAnyPaid) {
                                                                const ok = window.confirm(
                                                                    "У этой заявки подтверждён взнос. При отклонении взнос будет сброшен. Продолжить?"
                                                                );
                                                                if (!ok) return;
                                                            }
                                                            act(r.id, "reject");
                                                        }}
                                                    >
                                                        Отклонить
                                                    </button>
                                                </>
                                            ) : r.status === "accepted" ? (
                                                <button
                                                    disabled={busyId === r.id || regsLocked}
                                                    className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                                                    onClick={() => act(r.id, "unaccept" as any)}
                                                >
                                                    Снять принятие
                                                </button>
                                            ) : (
                                                <div className="text-xs text-slate-500">Заявка снята</div>
                                            )}

                                            {r.mode === "SOLO" && r.status === "accepted" && (
                                                <button
                                                    disabled={busyId === r.id || regsLocked || tournament?.status !== "draft" || payBusyKey === `${r.id}:1`}
                                                    className={
                                                        "min-w-[80px] rounded-xl h-9 px-3 py-2 text-sm font-bold border flex items-center justify-center gap-2 leading-none " +
                                                        (fullyPaid(r)
                                                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                            : "border-slate-200 hover:bg-slate-50")
                                                    }
                                                    onClick={() => setPaidWithSpinner(r.id, 1, !fullyPaid(r))}
                                                    title={fullyPaid(r) ? "Отменить поступление взноса" : "Подтвердить взнос"}
                                                >
                                                    {payBusyKey === `${r.id}:1` ? (
                                                        <span className="inline-flex items-center gap-2">
                                                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                                        </span>
                                                    ) : (
                                                        (fullyPaid(r) ? "Взнос ✓" : "Взнос +")
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* TEAM PAYMENTS */}
                                    {r.mode === "TEAM" && r.status === "accepted" ? (
                                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                            {[1, 2, 3].map((slot) => {
                                                const name =
                                                    slot === 1 ? r.team_player1 : slot === 2 ? r.team_player2 : r.team_player3;
                                                const isPaid = (payByReg.get(r.id)?.get(slot) ?? false);

                                                return (
                                                    <div
                                                        key={slot}
                                                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2"
                                                    >
                                                        <div className="min-w-0 text-sm font-semibold">
                                                            <span className="block truncate whitespace-nowrap" title={name}>
                                                                {name}
                                                            </span>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            disabled={busyId === r.id || regsLocked || tournament?.status !== "draft" || payBusyKey === `${r.id}:${slot}`}
                                                            className={
                                                                "min-w-[80px] shrink-0 rounded-lg border h-9 px-3 py-1.5 text-sm font-bold leading-none flex items-center justify-center gap-2 leading-none " +
                                                                (isPaid
                                                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                                    : "border-slate-200 hover:bg-slate-50")
                                                            }
                                                            onClick={() => setPaidWithSpinner(r.id, slot, !isPaid)}
                                                            title={isPaid ? "Отменить поступление взноса" : "Подтвердить взнос"}
                                                        >
                                                            {payBusyKey === `${r.id}:${slot}` ? (
                                                                <span className="inline-flex items-center gap-2">
                                                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                                                </span>
                                                            ) : (
                                                                (isPaid ? "Взнос ✓" : "Взнос +")
                                                            )}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}

                        {regs.length === 0 && (
                            <div className="text-sm text-slate-600">Пока нет заявок.</div>
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}