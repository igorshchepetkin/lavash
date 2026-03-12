// src/app/admin/t/[id]/registrations/page.tsx
/*
Purpose:
Judge/admin page for managing tournament registrations before tournament start.

Page layout:
Section 1 — Tournament header
- tournament name
- date / time
- mode badge
- status badge
- chief judge
- top-right buttons: ← Турниры / Обновить
- tournament tabs
- registration summary badges:
  - pending
  - accepted / reserve
  - paid accepted

Section 2 — Page actions
- Add registration button
- if registrations are locked, show blocking warning instead

Section 3 — Main content
- registration cards list
- strength controls
- accept / reject / unaccept / reserve confirm actions
- payment controls

Main responsibilities:
1. Load tournament, registrations, flags, and payment rows.
2. Show the operational state of each registration.
3. Enforce registration locking when tournament:
   - started
   - finished
   - canceled
4. Support reserve-specific status transitions.
5. Support payment confirmation UI.
6. Support strength editing while registrations are still editable.

Manual add registration modal:
- opens from “Добавить заявку”
- replaces older inline add-form approach
- supports both SOLO and TEAM input shape
- after successful creation shows confirmation code
- intended for direct communication to participant
- uses page overlay, focus style, ESC closing, and scroll lock

Strength semantics:
- SOLO: per-player strength
- TEAM: per-team strength

Reserve semantics:
- accepted = main roster
- reserve = accepted above capacity
- reserve_pending = invited from reserve, waiting confirmation

Outcome:
Acts as the pre-start control center for roster formation and payment readiness.
*/

"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import TournamentTabs from "@/components/TournamentTabs";
import { adminFetch } from "@/lib/adminClient";

type Registration = any;

function statusLabel(s: string) {
    if (s === "pending") return "На рассмотрении";
    if (s === "accepted") return "Принята";
    if (s === "reserve") return "Резерв";
    if (s === "reserve_pending") return "Резерв ➔ Основа";
    if (s === "rejected") return "Отклонена";
    if (s === "withdrawn") return "Снята";
    if (s === "canceled") return "Отменена";
    return s;
}

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

export default function RegistrationsPage() {
    const params = useParams<{ id: string }>();
    const tournamentId = params.id;

    const [tournament, setTournament] = useState<any>(null);
    const [regs, setRegs] = useState<Registration[]>([]);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [payBusyKey, setPayBusyKey] = useState<string | null>(null);
    const [flags, setFlags] = useState<any>(null);
    const [payments, setPayments] = useState<any[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [mounted, setMounted] = useState(false);

    async function load() {
        const res = await fetch(`/api/admin/tournament/${tournamentId}/registrations`);
        const json = await res.json();
        setTournament(json.tournament ?? null);
        setRegs(json.registrations ?? []);
        setFlags(json.flags ?? null);
        setPayments(json.payments ?? []);
        setLoaded(true);
    }

    async function act(
        registrationId: string,
        action: "accept" | "reject" | "unaccept" | "confirm_reserve"
    ) {
        setBusyId(registrationId);
        try {
            await adminFetch(`/api/admin/tournament/${tournamentId}/registrations`, {
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

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    const pendingCount = regs.filter((r) => r.status === "pending").length;
    const acceptedCount = regs.filter((r) => r.status === "accepted").length;
    const reserveCount = regs.filter(
        (r) => r.status === "reserve" || r.status === "reserve_pending"
    ).length;

    const limit =
        tournament?.registration_mode === "SOLO"
            ? 24
            : tournament?.registration_mode === "TEAM"
                ? 8
                : null;

    const started = !!flags?.started;
    const canceled = tournament?.status === "canceled";
    const finished = tournament?.status === "finished";

    const regsLocked = canceled || finished || started;
    const canAddRegistration = !regsLocked;

    const [showAddModal, setShowAddModal] = useState(false);
    const [addBusy, setAddBusy] = useState(false);
    const [addErr, setAddErr] = useState<string | null>(null);
    const [addResult, setAddResult] = useState<null | {
        text: string;
        code: string | null;
    }>(null);

    const [soloLast, setSoloLast] = useState("");
    const [soloFirst, setSoloFirst] = useState("");
    const [soloPhone, setSoloPhone] = useState("+");

    const [teamP1, setTeamP1] = useState("");
    const [teamP2, setTeamP2] = useState("");
    const [teamP3, setTeamP3] = useState("");
    const [teamPhone, setTeamPhone] = useState("+");

    function resetAddForm() {
        setAddErr(null);
        setAddResult(null);
        setSoloLast("");
        setSoloFirst("");
        setSoloPhone("+");
        setTeamP1("");
        setTeamP2("");
        setTeamP3("");
        setTeamPhone("+");
    }

    function openAddModal() {
        resetAddForm();
        setShowAddModal(true);
    }

    function closeAddModal() {
        if (addBusy) return;
        setShowAddModal(false);
    }

    useEffect(() => {
        if (!showAddModal) return;

        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape" && !addBusy) {
                setShowAddModal(false);
            }
        }

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [showAddModal, addBusy]);

    useEffect(() => {
        if (!showAddModal) return;

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
    }, [showAddModal]);

    async function submitAddRegistration() {
        if (!tournament) return;
        setAddErr(null);
        setAddResult(null);
        setAddBusy(true);

        try {
            const isSolo = tournament.registration_mode === "SOLO";

            const body = isSolo
                ? { solo_last_name: soloLast, solo_first_name: soloFirst, phone: soloPhone }
                : { team_player1: teamP1, team_player2: teamP2, team_player3: teamP3, phone: teamPhone };

            const res = await adminFetch(`/api/admin/tournament/${tournamentId}/registrations/create`, {
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
            setAddResult({
                text: "Заявка успешно добавлена.",
                code,
            });

            resetFormKeepResult(code);
            await load();
        } finally {
            setAddBusy(false);
        }
    }

    function resetFormKeepResult(code: string | null) {
        setSoloLast("");
        setSoloFirst("");
        setSoloPhone("+");
        setTeamP1("");
        setTeamP2("");
        setTeamP3("");
        setTeamPhone("+");
        setAddErr(null);
        setAddResult({
            text: "Заявка успешно добавлена.",
            code,
        });
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
        return [1, 2, 3].filter((s) => mm.get(s)).length;
    }

    function fullyPaid(r: any) {
        const c = paidCountForReg(r);
        return r.mode === "SOLO" ? c === 1 : c === 3;
    }

    async function setPaid(registrationId: string, slot: number, paid: boolean) {
        await adminFetch(`/api/admin/tournament/${tournamentId}/registrations/payment`, {
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

    const paidAcceptedCount = regs.filter((r) => r.status === "accepted" && fullyPaid(r)).length;

    if (!loaded) {
        return (
            <main className="space-y-6">
                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    Загрузка...
                </section>
            </main>
        );
    }

    const st = statusBadge(tournament?.status ?? "draft");
    const md = modeBadge((tournament?.registration_mode ?? "SOLO") as "TEAM" | "SOLO");

    const addModal =
        mounted && showAddModal
            ? createPortal(
                <div
                    onClick={closeAddModal}
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
                                    <h2 className="text-lg font-bold text-slate-900">Добавить заявку</h2>
                                    <div className="mt-1 text-sm text-slate-500">
                                        Судья может добавить игрока или команду вручную.
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    disabled={addBusy}
                                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                                    onClick={closeAddModal}
                                >
                                    Закрыть
                                </button>
                            </div>

                            <div className="p-5">
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
                                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                                        {addErr}
                                    </div>
                                )}

                                {addResult && (
                                    <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4">
                                        <div className="text-sm font-semibold text-orange-700">{addResult.text}</div>

                                        {addResult.code && (
                                            <div className="mt-3 rounded-xl border border-orange-200 bg-white px-3 py-3">
                                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                    Код подтверждения
                                                </div>
                                                <div className="mt-1 text-2xl font-extrabold tracking-wide text-slate-900">
                                                    {addResult.code}
                                                </div>
                                                <div className="mt-2 text-xs text-slate-500">
                                                    Сообщите этот код участнику. Он понадобится для подтверждения перехода из резерва в основу.
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="mt-4 flex flex-wrap gap-2">
                                    <button
                                        disabled={addBusy}
                                        className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"
                                        onClick={submitAddRegistration}
                                        type="button"
                                    >
                                        {addBusy ? "Добавляю..." : "Добавить заявку"}
                                    </button>
                                </div>

                                <div className="mt-3 text-xs text-slate-500">
                                    {tournament?.registration_mode === "SOLO" ? (
                                        <>
                                            Уровень игрока в режиме SOLO по умолчанию будет <b>3</b> (потом можно поменять).
                                        </>
                                    ) : (
                                        <>
                                            Уровень команды по умолчанию будет <b>3</b> (потом можно поменять).
                                        </>
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>
                </div>,
                document.body
            )
            : null;

    return (
        <>
            <main className="space-y-6">
                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div
                        className="grid gap-4"
                        style={{
                            gridTemplateColumns: "minmax(0, 1fr) auto",
                            alignItems: "start",
                        }}
                    >
                        <div className="min-w-0">
                            <h1 className="text-2xl font-extrabold text-slate-900">
                                {tournament?.name ?? "Турнир"}
                            </h1>

                            <div className="mt-4 rounded-2xl border border-slate-200 px-4 py-3">
                                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                                    <span>
                                        {tournament?.date}
                                        {tournament?.start_time ? ` · ${tournament.start_time}` : ""}
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
                                        {tournament?.chief_judge_name || "—"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div
                            className="flex flex-col gap-3"
                            style={{
                                alignItems: "flex-end",
                            }}
                        >
                            <div className="flex flex-wrap gap-2 justify-end">
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

                            <div className="flex flex-wrap justify-end gap-2">
                                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                                    На рассмотрении: {pendingCount}
                                </div>

                                {limit && (
                                    <div className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
                                        В основе: {acceptedCount} из {limit}
                                        {reserveCount ? ` · Резерв: ${reserveCount}` : ""}
                                    </div>
                                )}

                                <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                                    Сделаны взносы: {paidAcceptedCount}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-2">
                        <TournamentTabs tournamentId={tournamentId} />
                    </div>
                </section>

                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    {canAddRegistration ? (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <button
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                                onClick={openAddModal}
                                type="button"
                            >
                                Добавить заявку
                            </button>
                        </div>
                    ) : (
                        <div>
                            <div className="mt-2 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm font-semibold text-orange-700">
                                Турнир уже стартовал — заявки заблокированы (нельзя добавлять, принимать, отклонять или снимать принятие).
                            </div>
                        </div>
                    )}
                </section>

                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="font-semibold text-slate-700">Список заявок</div>

                    <div className="mt-4 grid gap-3">
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
                                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_16rem] sm:items-center">
                                        <div className="min-w-0">
                                            <div className="font-bold">{title}</div>

                                            <div className="text-sm text-slate-600">
                                                {r.phone ? (
                                                    <>
                                                        тел: <b>{r.phone}</b> ·{" "}
                                                    </>
                                                ) : null}
                                                <span
                                                    className={
                                                        "font-semibold " +
                                                        (r.status === "reserve_pending"
                                                            ? "text-orange-700"
                                                            : r.status === "reserve"
                                                                ? "text-slate-700"
                                                                : "text-orange-600")
                                                    }
                                                >
                                                    {statusLabel(r.status)}
                                                </span>

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

                                        <div className="flex items-center justify-start gap-2 sm:justify-start">
                                            {r.status !== "withdrawn" && tournament?.status === "draft" ? (
                                                <>
                                                    <div className="w-20 text-right text-xs font-semibold text-slate-600">
                                                        Уровень:
                                                    </div>
                                                    <select
                                                        className="w-16 rounded-xl border border-slate-200 px-2 py-1 text-sm"
                                                        value={r.strength ?? 3}
                                                        title="1 - самый слабый, 5 - самый сильный"
                                                        onChange={async (e) => {
                                                            const v = Number(e.target.value);
                                                            await adminFetch(
                                                                `/api/admin/tournament/${tournamentId}/registrations/strength`,
                                                                {
                                                                    method: "POST",
                                                                    headers: { "Content-Type": "application/json" },
                                                                    body: JSON.stringify({ registrationId: r.id, strength: v }),
                                                                }
                                                            );
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
                                                <div className="h-9" />
                                            )}
                                        </div>

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
                                            ) : r.status === "accepted" ||
                                                r.status === "reserve" ||
                                                r.status === "reserve_pending" ? (
                                                <>
                                                    <button
                                                        disabled={busyId === r.id || regsLocked}
                                                        className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                                                        onClick={() => act(r.id, "unaccept" as any)}
                                                    >
                                                        Снять принятие
                                                    </button>

                                                    {r.status === "reserve_pending" && (
                                                        <button
                                                            disabled={busyId === r.id || regsLocked}
                                                            className="min-w-[85px] rounded-xl h-9 bg-orange-600 px-3 py-2 text-sm font-bold flex items-center justify-center gap-2 leading-none text-white disabled:opacity-50"
                                                            onClick={() => act(r.id, "confirm_reserve")}
                                                            title="Подтвердить переход в основной список (если место ещё свободно)"
                                                        >
                                                            В основу
                                                        </button>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="text-xs text-slate-500">Заявка снята</div>
                                            )}

                                            {r.mode === "SOLO" && r.status === "accepted" && (
                                                <button
                                                    disabled={
                                                        busyId === r.id ||
                                                        regsLocked ||
                                                        tournament?.status !== "draft" ||
                                                        payBusyKey === `${r.id}:1`
                                                    }
                                                    className={
                                                        "min-w-[85px] rounded-xl h-9 px-3 py-2 text-sm font-bold border flex items-center justify-center gap-2 leading-none " +
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
                                                    ) : fullyPaid(r) ? (
                                                        "Взнос ✓"
                                                    ) : (
                                                        "Взнос +"
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {r.mode === "TEAM" && r.status === "accepted" ? (
                                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                            {[1, 2, 3].map((slot) => {
                                                const name =
                                                    slot === 1 ? r.team_player1 : slot === 2 ? r.team_player2 : r.team_player3;
                                                const isPaid = payByReg.get(r.id)?.get(slot) ?? false;

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
                                                            disabled={
                                                                busyId === r.id ||
                                                                regsLocked ||
                                                                tournament?.status !== "draft" ||
                                                                payBusyKey === `${r.id}:${slot}`
                                                            }
                                                            className={
                                                                "min-w-[80px] shrink-0 rounded-lg border h-9 px-3 py-1.5 text-sm font-bold flex items-center justify-center gap-2 leading-none " +
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
                                                            ) : isPaid ? (
                                                                "Взнос ✓"
                                                            ) : (
                                                                "Взнос +"
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

                        {regs.length === 0 && <div className="text-sm text-slate-600">Пока нет заявок.</div>}
                    </div>
                </section>
            </main>

            {addModal}
        </>
    );
}