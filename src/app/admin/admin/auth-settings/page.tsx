// src/app/admin/admin/auth-settings/page.tsx
/*
Purpose:
Configuration page for global admin authentication settings.

Responsibilities:
1. Load singleton auth settings.
2. Display editable parameters:
   - minimum password length
   - password complexity requirement
   - password max age
   - session idle timeout
   - auth log retention
   - tournament archive threshold
3. Validate and save changes through the backend.
4. Show the page in section-based admin layout.

Design intent:
Separates security policy management from user management
and keeps admin pages visually consistent.

Outcome:
Provides one controlled place to manage admin authentication and retention policy.
*/

"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminClient";

export default function AuthSettingsPage() {
  const [form, setForm] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/auth-settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setForm(j.settings);
        setError(null);
      })
      .catch(() => {
        setError("Не удалось загрузить параметры авторизации.");
      });
  }, []);

  async function save() {
    setBusy(true);
    setMsg(null);
    setError(null);

    try {
      const res = await adminFetch("/api/admin/auth-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json?.error ?? "Не удалось сохранить параметры.");
        return;
      }

      setForm(json.settings);
      setMsg("Сохранено.");
    } catch {
      setError("Не удалось сохранить параметры.");
    } finally {
      setBusy(false);
    }
  }

  if (!form) {
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
        <h1 className="text-2xl font-extrabold text-slate-900">Параметры авторизации</h1>
        <p className="mt-1 text-sm text-slate-500">
          Глобальные параметры безопасности, сессий и сроков хранения.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid max-w-3xl gap-4 md:grid-cols-2">
          <label className="text-sm">
            <div className="mb-1 font-semibold text-slate-700">Минимальная длина пароля</div>
            <input
              type="number"
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              value={form.min_password_length ?? 8}
              onChange={(e) =>
                setForm({ ...form, min_password_length: Number(e.target.value) })
              }
            />
          </label>

          <label className="text-sm">
            <div className="mb-1 font-semibold text-slate-700">Срок жизни пароля, дней</div>
            <input
              type="number"
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              value={form.password_max_age_days ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  password_max_age_days:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </label>

          <label className="text-sm">
            <div className="mb-1 font-semibold text-slate-700">
              Таймаут бездействия, минут
            </div>
            <input
              type="number"
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              value={form.session_idle_timeout_minutes ?? 60}
              onChange={(e) =>
                setForm({
                  ...form,
                  session_idle_timeout_minutes: Number(e.target.value),
                })
              }
            />
          </label>

          <label className="text-sm">
            <div className="mb-1 font-semibold text-slate-700">
              Неудачных входов до блокировки
            </div>
            <input
              type="number"
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              value={form.max_failed_login_attempts ?? 3}
              onChange={(e) =>
                setForm({ ...form, max_failed_login_attempts: Number(e.target.value) })
              }
            />
          </label>

          <label className="text-sm">
            <div className="mb-1 font-semibold text-slate-700">
              Блокировка входа, секунд
            </div>
            <input
              type="number"
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              value={form.login_lockout_seconds ?? 60}
              onChange={(e) =>
                setForm({ ...form, login_lockout_seconds: Number(e.target.value) })
              }
            />
          </label>

          <label className="text-sm">
            <div className="mb-1 font-semibold text-slate-700">Хранить лог, дней</div>
            <input
              type="number"
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              value={form.auth_log_retention_days ?? 180}
              onChange={(e) =>
                setForm({ ...form, auth_log_retention_days: Number(e.target.value) })
              }
            />
          </label>

          <label className="text-sm">
            <div className="mb-1 font-semibold text-slate-700">
              Автоархив турниров, дней
            </div>
            <input
              type="number"
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              value={form.tournament_archive_days ?? 30}
              onChange={(e) =>
                setForm({ ...form, tournament_archive_days: Number(e.target.value) })
              }
            />
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={!!form.require_complexity}
              onChange={(e) =>
                setForm({ ...form, require_complexity: e.target.checked })
              }
            />
            Требовать сложный пароль
          </label>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            className="rounded-xl bg-orange-600 px-4 py-2 font-bold text-white hover:bg-orange-700 disabled:opacity-60"
            onClick={save}
            disabled={busy}
          >
            {busy ? "Сохраняем..." : "Сохранить"}
          </button>
        </div>

        {msg && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            {msg}
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}
      </section>
    </main>
  );
}