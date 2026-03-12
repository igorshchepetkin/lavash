// src/app/admin/admin/auth-log/page.tsx
/*
Purpose:
Audit page for authentication and password-related admin events.

Responsibilities:
1. Load auth log entries from the backend.
2. Show:
   - timestamp
   - login
   - event type
   - success/failure
   - message
3. Keep the log read-only in UI.
4. Show the page in section-based admin layout.

Design intent:
Security-sensitive operational history must be visible but not mutable,
and the admin pages should keep a consistent sectional structure.

Outcome:
Provides the admin audit trail for login failures, password changes,
password resets, user blocking/unblocking and logout events.
*/

"use client";

import { useEffect, useState } from "react";

export default function AuthLogPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/auth-log", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setItems(j.items ?? []);
        setError(null);
      })
      .catch(() => {
        setError("Не удалось загрузить лог авторизации.");
      })
      .finally(() => {
        setLoaded(true);
      });
  }, []);

  if (!loaded) {
    return (
      <main className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          Загрузка...
        </section>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-extrabold text-slate-900">Лог авторизации</h1>
        <p className="mt-1 text-sm text-slate-500">
          Журнал входов, выходов, смен паролей и административных действий над учётными записями.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="text-sm text-slate-500">Записей пока нет.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Дата</th>
                  <th className="py-2 pr-4">Логин</th>
                  <th className="py-2 pr-4">Событие</th>
                  <th className="py-2 pr-4">Успех</th>
                  <th className="py-2 pr-4">Сообщение</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">
                      {item.created_at
                        ? new Date(item.created_at).toLocaleString("ru-RU")
                        : "—"}
                    </td>
                    <td className="py-2 pr-4">{item.login ?? "—"}</td>
                    <td className="py-2 pr-4">{item.event_type}</td>
                    <td className="py-2 pr-4">{item.success ? "Да" : "Нет"}</td>
                    <td className="py-2 pr-4">{item.message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}