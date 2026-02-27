"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function ApplyPage() {
  const params = useParams();
  const tournamentId = (params as any).id as string;

  const [mode, setMode] = useState<"TEAM" | "SOLO" | null>(null);
  const [loading, setLoading] = useState(true);

  // form fields
  const [soloLast, setSoloLast] = useState("");
  const [soloFirst, setSoloFirst] = useState("");
  const [phone, setPhone] = useState("+");

  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [p3, setP3] = useState("");

  const [done, setDone] = useState<null | { confirmation_code: string }>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    async function loadMode() {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/tournament/${tournamentId}/mode`);
      const json = await res.json();
      if (!res.ok) {
        setErr(json?.error ?? "Ошибка");
        setLoading(false);
        return;
      }
      setMode(json.registration_mode);
      setLoading(false);
    }
    if (tournamentId) loadMode();
  }, [tournamentId]);

  async function submit() {
    setErr(null);
    const body =
      mode === "SOLO"
        ? { solo_last_name: soloLast, solo_first_name: soloFirst, phone }
        : { team_player1: p1, team_player2: p2, team_player3: p3, phone };

    const res = await fetch(`/api/tournament/${tournamentId}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    const json = text ? JSON.parse(text) : null;

    if (!res.ok) {
      setErr(json?.error?.message ?? json?.error ?? "Ошибка отправки");
      return;
    }
    setDone({ confirmation_code: json.confirmation_code });

    setPhone("+");
    setSoloLast("");
    setSoloFirst("");
    setP1(""); setP2(""); setP3("");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-xl px-4 py-10 text-sm text-slate-600">Загрузка…</div>
      </main>
    );
  }

  if (err) {
    return (
      <main className="min-h-screen bg-white">
        <a
          className="inline-block rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          href={`/t/${tournamentId}`}
        >
          ← К турниру
        </a>
        <div className="mx-auto max-w-xl px-4 py-10">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {err}
          </div>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-xl px-4 py-10">
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
            <div className="text-lg font-extrabold">Заявка отправлена ✅</div>

            <div className="mt-3 text-sm text-slate-700">
              <div className="font-semibold">Код подтверждения для заявки:</div>
              <div className="mt-1 rounded-xl border border-orange-200 bg-white px-3 py-2 font-mono text-base font-bold text-orange-700">
                {done.confirmation_code}
              </div>
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Сохрани этот код. Позже он будет использоваться для подтверждения или отмены действий по заявке.
            </div>

            <a
              className="mt-5 inline-block rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
              href={`/t/${tournamentId}`}
            >
              ← К турниру
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight">Заявка на турнир</h1>
          <div className="flex gap-2">
            <a
              className="inline-block rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
              href={`/t/${tournamentId}`}
            >
              ← К турниру
            </a>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 p-5">
          <div className="text-sm text-slate-600">
            Режим турнира: <b className="text-orange-600">{mode}</b>
          </div>

          {mode === "SOLO" ? (
            <div className="mt-4 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
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
              </div>

              <label className="text-sm">
                <div className="mb-1 font-semibold text-slate-700">Телефон</div>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+7..."
                />
                <div className="mt-1 text-xs text-slate-500">Номер должен начинаться с “+”.</div>
              </label>
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {[{ v: p1, s: setP1, label: "Игрок 1" }, { v: p2, s: setP2, label: "Игрок 2" }, { v: p3, s: setP3, label: "Игрок 3" }].map((x) => (
                <label key={x.label} className="text-sm">
                  <div className="mb-1 font-semibold text-slate-700">{x.label} (ФИО)</div>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                    value={x.v}
                    onChange={(e) => x.s(e.target.value)}
                  />
                </label>
              ))}
              <label className="text-sm">
                <div className="mb-1 font-semibold text-slate-700">Телефон заявителя команды</div>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+7..."
                />
                <div className="mt-1 text-xs text-slate-500">Номер должен начинаться с “+”.</div>
              </label>
            </div>
          )}

          {err && <div className="mt-3 text-sm font-semibold text-red-600">{err}</div>}

          <button
            className="mt-5 w-full rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700"
            onClick={submit}
          >
            Отправить заявку
          </button>
        </div>
      </div>
    </main>
  );
}