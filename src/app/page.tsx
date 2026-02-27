"use client";

import { useEffect, useState } from "react";

type T = {
  id: string;
  name: string;
  date: string;
  start_time: string | null;
  registration_mode: "TEAM" | "SOLO";
  status: "draft" | "live" | "finished" | "canceled";
};

function statusLabel(s: T["status"]) {
  if (s === "draft") return { text: "приём заявок", badge: "bg-orange-100 text-orange-700" };
  if (s === "live") return { text: "идёт", badge: "bg-slate-100 text-slate-700" };
  if (s === "finished") return { text: "завершён", badge: "bg-slate-100 text-slate-700" };
  return { text: "отменён", badge: "bg-red-100 text-red-700" };
}

export default function Home() {
  const [items, setItems] = useState<T[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const res = await fetch("/api/tournaments");
    const json = await res.json();
    if (!res.ok) {
      setErr("Не удалось загрузить турниры");
      return;
    }
    setItems(json.tournaments ?? []);
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Турниры <span className="text-orange-600">“Лаваш”</span>
          </h1>
          <a className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50" href="/admin">
            Админка
          </a>
        </div>

        {err && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {err}
          </div>
        )}

        <div className="mt-6 grid gap-3">
          {items.map((t) => {
            const st = statusLabel(t.status);
            const dt = `${t.date}${t.start_time ? ` · ${t.start_time}` : ""}`;
            const canApply = t.status === "draft";

            return (
              <div key={t.id} className="rounded-2xl border border-slate-200 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-lg font-extrabold">{t.name}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {dt} · <b className="text-orange-600">{t.registration_mode}</b>
                      <span className={`ml-2 inline-block rounded-full px-2 py-1 text-xs font-bold ${st.badge}`}>
                        {st.text}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                      href={`/t/${t.id}`}
                    >
                      Открыть витрину
                    </a>

                    {canApply && (
                      <a
                        className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700"
                        href={`/t/${t.id}/apply`}
                      >
                        Подать заявку
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {items.length === 0 && !err && (
            <div className="text-sm text-slate-600">Пока нет турниров.</div>
          )}
        </div>
      </div>
    </main>
  );
}