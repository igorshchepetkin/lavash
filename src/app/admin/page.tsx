"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-4.4" />
      <path d="M9.4 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a18.7 18.7 0 0 1-3.1 3.8" />
      <path d="M6.5 6.5A18.2 18.2 0 0 0 2 12s3.5 7 10 7a10.7 10.7 0 0 0 5.1-1.2" />
    </svg>
  );
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError("Неверный логин или пароль.");
        return;
      }
      if (json?.must_change_password || json?.password_expired) {
        router.replace("/admin/change-password");
      } else {
        router.replace("/admin/tournaments");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
        <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-extrabold text-slate-900">Лаваш Admin</h1>
          <p className="mt-2 text-sm text-slate-500">
            Введите логин и пароль администратора / судьи.
          </p>

          <div className="mt-5 space-y-3">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Логин"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) 44px",
                gap: "8px",
                alignItems: "end",
              }}
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                placeholder="Пароль"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              <a
                href="#"
                title={showPassword ? "Скрыть пароль" : "Показать пароль"}
                aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                onClick={(e) => {
                  e.preventDefault();
                  setShowPassword((v) => !v);
                }}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </a>
            </div>

            <button
              disabled={busy}
              className="w-full rounded-xl bg-orange-600 px-4 py-2 font-bold text-white hover:bg-orange-700 disabled:opacity-60"
              onClick={submit}
            >
              {busy ? "Входим..." : "Войти"}
            </button>

            {error && <div className="text-sm font-semibold text-red-600">{error}</div>}
          </div>
        </section>
      </div>
    </main>
  );
}