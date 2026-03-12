// src/app/archive/page.tsx
/*
Purpose:
Public archive page for completed or archived tournaments.

Responsibilities:
1. Load archived tournaments list.
2. Keep active tournaments out of this page.
3. Render archive cards in the same visual style as the main public list.
4. Provide navigation back to the main tournaments list.

Design intent:
Separates historical tournaments from the active public homepage,
keeping current tournament discovery simple while preserving access to history.

Outcome:
Provides a dedicated historical catalog of past tournaments.
*/

"use client";

import { useEffect, useState } from "react";

type T = {
  id: string;
  name: string;
  date: string;
  start_time: string | null;
  registration_mode: "TEAM" | "SOLO";
  status: string;
  chief_judge_name?: string | null;
};

function statusBadge(status: string) {
  switch (status) {
    case "draft":
      return { text: "Приём заявок", cls: "bg-orange-100 text-orange-700 border-orange-200" };
    case "live":
      return { text: "Идёт", cls: "bg-sky-100 text-sky-700 border-sky-200" };
    case "finished":
      return { text: "Завершён", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    case "canceled":
      return { text: "Отменён", cls: "bg-slate-200 text-slate-700 border-slate-300" };
    default:
      return { text: status, cls: "bg-slate-100 text-slate-700 border-slate-200" };
  }
}

function modeBadge(mode: "TEAM" | "SOLO") {
  if (mode === "SOLO") {
    return { text: "SOLO", cls: "bg-orange-100 text-orange-700 border-orange-200" };
  }
  return { text: "TEAM", cls: "bg-violet-100 text-violet-700 border-violet-200" };
}

export default function PublicArchivePage() {
  const [items, setItems] = useState<T[]>([]);

  useEffect(() => {
    fetch("/api/tournaments?archived=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setItems(j.tournaments ?? []));
  }, []);

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">Архив турниров “Лаваш”</h1>
          <a
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            href="/"
          >
            К активным турнирам
          </a>
        </div>

        <div className="mt-6 grid gap-3">
          {items.map((t) => {
            const st = statusBadge(t.status);
            const md = modeBadge(t.registration_mode);

            return (
              <div key={t.id} className="rounded-2xl border border-slate-200 p-5">
                <div className="text-lg font-extrabold">{t.name}</div>

                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <span>
                    {t.date}
                    {t.start_time ? ` · ${t.start_time}` : ""}
                  </span>

                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${md.cls}`}>
                    {md.text}
                  </span>

                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${st.cls}`}>
                    {st.text}
                  </span>
                </div>

                <div className="mt-2 text-sm text-slate-500">
                  Главный судья:{" "}
                  <span className="font-semibold text-slate-700">
                    {t.chief_judge_name || "—"}
                  </span>
                </div>

                <a
                  className="mt-3 inline-flex rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                  href={`/t/${t.id}`}
                >
                  Открыть витрину
                </a>
              </div>
            );
          })}

          {items.length === 0 && (
            <div className="text-sm text-slate-500">Архив пока пуст.</div>
          )}
        </div>
      </div>
    </main>
  );
}