// src/app/page.tsx
/*
Purpose:
Public homepage listing active tournaments.

Responsibilities:
1. Load public tournaments list from `/api/tournaments`.
2. Show tournament cards with:
   - name
   - date / time
   - mode badge
   - status badge
   - chief judge
3. Provide navigation actions:
   - open tournament showcase
   - apply to tournament if status == draft
   - open archive
   - enter admin panel

Design intent:
Acts as the public index of currently relevant tournaments.
Archived tournaments are intentionally separated into their own page.

Outcome:
Provides the main public entry point into Lavash.
*/

"use client";

import { useEffect, useState } from "react";

type T = {
  id: string;
  name: string;
  date: string;
  start_time: string | null;
  registration_mode: "TEAM" | "SOLO";
  status: "draft" | "live" | "finished" | "canceled";
  chief_judge_name?: string | null;
};

function statusBadge(s: T["status"]) {
  if (s === "draft") {
    return {
      text: "Приём заявок",
      style: {
        backgroundColor: "#FFEDD5",
        color: "#C2410C",
        borderColor: "#FED7AA",
      },
    };
  }

  if (s === "live") {
    return {
      text: "Идёт",
      style: {
        backgroundColor: "#E0F2FE",
        color: "#0369A1",
        borderColor: "#BAE6FD",
      },
    };
  }

  if (s === "finished") {
    return {
      text: "Завершён",
      style: {
        backgroundColor: "#D1FAE5",
        color: "#047857",
        borderColor: "#A7F3D0",
      },
    };
  }

  return {
    text: "Отменён",
    style: {
      backgroundColor: "#E2E8F0",
      color: "#475569",
      borderColor: "#CBD5E1",
    },
  };
}

function modeBadge(mode: T["registration_mode"]) {
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

function cardAccent(status: T["status"]) {
  switch (status) {
    case "draft":
      return "#F59E0B";
    case "live":
      return "#0EA5E9";
    case "finished":
      return "#10B981";
    case "canceled":
      return "#94A3B8";
    default:
      return "#CBD5E1";
  }
}

export default function Home() {
  const [items, setItems] = useState<T[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const res = await fetch("/api/tournaments", { cache: "no-store" });
    const json = await res.json();

    if (!res.ok) {
      setErr("Не удалось загрузить турниры");
      return;
    }

    setItems(json.tournaments ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              Турниры <span className="text-orange-600">“Лаваш”</span>
            </h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
              href="/archive"
            >
              Архив турниров
            </a>
            <a
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
              href="/admin"
            >
              Админка
            </a>
          </div>
        </div>

        {err && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {err}
          </div>
        )}

        <div className="mt-6 grid gap-3">
          {items.map((t) => {
            const st = statusBadge(t.status);
            const md = modeBadge(t.registration_mode);
            const dt = `${t.date}${t.start_time ? ` · ${t.start_time}` : ""}`;
            const canApply = t.status === "draft";

            return (
              <div
                key={t.id}
                className="rounded-2xl border border-slate-200 p-5"
                style={{
                  borderLeftWidth: "6px",
                  borderLeftColor: cardAccent(t.status),
                }}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-lg font-extrabold">{t.name}</div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                      <span>{dt}</span>

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

                    <div className="mt-2 text-sm text-slate-500">
                      Главный судья:{" "}
                      <span className="font-semibold text-slate-700">
                        {t.chief_judge_name || "—"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                      href={`/t/${t.id}`}
                    >
                      Открыть
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