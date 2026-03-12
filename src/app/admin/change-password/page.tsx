// src/app/admin/change-password/page.tsx
/*
Purpose:
Forced or voluntary admin password change screen.

Responsibilities:
1. Read current authenticated session context.
2. Collect:
   - current password
   - new password
   - confirmation
3. Submit to the password-change API.
4. Display validation errors from password policy.
5. Prevent using the same password as the current one.
6. Support password show/hide controls.
7. On success:
   - clear forced-change UI state
   - allow normal redirect into the admin workspace

Outcome:
Ensures first-login, reset-password, and expired-password flows are completed before
the user continues into the admin panel.
*/

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminFetch } from "@/lib/adminClient";

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

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const sameAsCurrent =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    currentPassword === newPassword;

  const passwordsMatch =
    showNewPassword ||
    (newPassword.length > 0 &&
      confirmPassword.length > 0 &&
      newPassword === confirmPassword);

  const passwordsMismatch =
    !showNewPassword &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    newPassword !== confirmPassword;

  const submitDisabled =
    busy ||
    !currentPassword.trim() ||
    !newPassword.trim() ||
    sameAsCurrent ||
    (!showNewPassword && (!confirmPassword.trim() || passwordsMismatch));

  async function submit() {
    setBusy(true);
    setError(null);
    setOk(null);

    if (currentPassword === newPassword) {
      setError("Новый пароль не должен совпадать с текущим.");
      setBusy(false);
      return;
    }

    try {
      const res = await adminFetch("/api/admin/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword: showNewPassword ? newPassword : confirmPassword,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Не удалось изменить пароль.");
        return;
      }

      setOk("Пароль сохранён.");
      setTimeout(() => router.replace("/admin/tournaments"), 500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
        <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-extrabold text-slate-900">Создайте новый пароль</h1>
          <p className="mt-2 text-sm text-slate-500">
            Пароль не должен совпадать с текущим.
          </p>

          <div className="mt-5 space-y-3">
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
                type={showCurrentPassword ? "text" : "password"}
                placeholder="Текущий пароль"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <a
                href="#"
                title={showCurrentPassword ? "Скрыть пароль" : "Показать пароль"}
                aria-label={showCurrentPassword ? "Скрыть пароль" : "Показать пароль"}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                onClick={(e) => {
                  e.preventDefault();
                  setShowCurrentPassword((v) => !v);
                }}
              >
                {showCurrentPassword ? <EyeOffIcon /> : <EyeIcon />}
              </a>
            </div>

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
                type={showNewPassword ? "text" : "password"}
                placeholder="Новый пароль"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />

              <a
                href="#"
                title={showNewPassword ? "Скрыть пароль" : "Показать пароль"}
                aria-label={showNewPassword ? "Скрыть пароль" : "Показать пароль"}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                onClick={(e) => {
                  e.preventDefault();
                  setShowNewPassword((v) => {
                    const next = !v;
                    if (next) setConfirmPassword("");
                    return next;
                  });
                }}
              >
                {showNewPassword ? <EyeOffIcon /> : <EyeIcon />}
              </a>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) 44px",
                gap: "8px",
                alignItems: "end",
              }}
            >
              {!showNewPassword && (
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  type="password"
                  placeholder="Повторите пароль"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              )}
              <></>
            </div>

            {sameAsCurrent && (
              <div className="text-sm font-semibold text-red-600">
                Новый пароль не должен совпадать с текущим.
              </div>
            )}

            {!showNewPassword &&
              newPassword.length > 0 &&
              confirmPassword.length > 0 &&
              !sameAsCurrent && (
                <div
                  className={`text-sm font-semibold ${passwordsMismatch ? "text-red-600" : "text-emerald-600"
                    }`}
                >
                  {passwordsMatch ? "Пароли совпадают." : "Пароли не совпадают."}
                </div>
              )}

            <button
              disabled={submitDisabled}
              className="w-full rounded-xl bg-orange-600 px-4 py-2 font-bold text-white hover:bg-orange-700 disabled:opacity-60"
              onClick={submit}
            >
              {busy ? "Сохраняем..." : "Сохранить новый пароль"}
            </button>

            {error && <div className="text-sm font-semibold text-red-600">{error}</div>}
            {ok && <div className="text-sm font-semibold text-emerald-600">{ok}</div>}
          </div>
        </section>
      </div>
    </main>
  );
}