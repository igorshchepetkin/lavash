// src/app/admin/archive/page.tsx
/*
Purpose:
Admin archive page for tournaments that are no longer shown in the active admin list.

Responsibilities:
1. Load archived tournaments.
2. Render them separately from active tournaments.
3. Preserve the same tournament card semantics as the main admin list.
4. Allow admins/judges to open archived tournaments for viewing in the appropriate context.

Design intent:
Keeps the active working list short and operationally focused,
while still preserving access to historical tournaments.

Outcome:
Provides the admin-facing archive workspace for completed/archived tournaments.
*/

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function ArchivePage() {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/admin/tournaments?archived=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setItems(j.tournaments ?? []));
  }, []);

  return (
    <main className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-extrabold text-slate-900">Архив турниров</h1>
      <p className="mt-1 text-sm text-slate-500">Сюда попадают завершённые или отменённые турниры после ручного архивирования либо по правилу автоархивации.</p>
      <div className="mt-6 grid gap-3">
        {items.map((t) => (
          <div key={t.id} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-bold">{t.name}</div>
                <div className="text-sm text-slate-500">{t.date} · {t.registration_mode} · {t.status}</div>
              </div>
              <Link className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50" href={`/admin/t/${t.id}/ops`}>
                Открыть
              </Link>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="text-sm text-slate-500">Архив пуст.</div>}
      </div>
    </main>
  );
}
