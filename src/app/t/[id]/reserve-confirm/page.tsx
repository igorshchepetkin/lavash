// src/app/t/[id]/reserve-confirm/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
      aria-label="loading"
    />
  );
}

export default function ReserveConfirmPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = (params as any).id as string;

  const [mode, setMode] = useState<"TEAM" | "SOLO" | null>(null);
  const [loading, setLoading] = useState(true);

  const [phone, setPhone] = useState("+");
  const [code, setCode] = useState("");

  const [soloLast, setSoloLast] = useState("");
  const [anyName, setAnyName] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [ok, setOk] = useState<null | { promoted: boolean; status: string }>(null);
  const [err, setErr] = useState<string | null>(null);

  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const msgRef = useRef<HTMLDivElement | null>(null);

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

  // cleanup countdown timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const disabled = useMemo(() => {
    // lock after success OR while submitting OR while loading mode
    return submitting || !!ok || loading;
  }, [submitting, ok, loading]);

  function startRedirectCountdown(seconds: number) {
    setCountdown(seconds);

    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev == null) return null;
        if (prev <= 1) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          timerRef.current = null;
          router.push(`/t/${tournamentId}`);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function scrollToMsg() {
    // small delay to ensure DOM updated
    window.setTimeout(() => {
      msgRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  async function submit() {
    if (!mode) return;

    setErr(null);
    setOk(null);
    setSubmitting(true);

    const body =
      mode === "SOLO"
        ? { confirmation_code: code, phone, solo_last_name: soloLast }
        : { confirmation_code: code, phone, any_player_name: anyName };

    try {
      const res = await fetch(`/api/tournament/${tournamentId}/reserve-confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const e = json?.error?.message ?? json?.error ?? "Ошибка";
        setErr(String(e));
        setSubmitting(false);
        scrollToMsg();
        return;
      }

      setOk({ promoted: !!json.promoted, status: json.status });

      // lock UI and auto-return
      setSubmitting(false);
      scrollToMsg();
      startRedirectCountdown(10);
    } catch (e: any) {
      setErr("Ошибка сети. Попробуйте ещё раз.");
      setSubmitting(false);
      scrollToMsg();
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-xl px-4 py-10 text-sm text-slate-600">Загрузка…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight">Переход из резерва</h1>
          <a
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            href={`/t/${tournamentId}`}
          >
            ← К турниру
          </a>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 p-5">
          <div className="text-sm text-slate-700">
            Заполните поля ниже, чтобы подтвердить переход из резерва в основной список.
            Если место уже заняли (24 игрока / 8 команд), заявка останется в резерве.
          </div>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-slate-600">Телефон</span>
              <input
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm disabled:bg-slate-50"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+7..."
                disabled={disabled}
                inputMode="tel"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-semibold text-slate-600">Код подтверждения</span>
              <input
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm disabled:bg-slate-50"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ABC123"
                disabled={disabled}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
              <div className="text-[12px] text-slate-500">Регистр букв не важен.</div>
            </label>

            {mode === "SOLO" ? (
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-slate-600">Фамилия</span>
                <input
                  className="h-10 rounded-xl border border-slate-200 px-3 text-sm disabled:bg-slate-50"
                  value={soloLast}
                  onChange={(e) => setSoloLast(e.target.value)}
                  placeholder="Иванов"
                  disabled={disabled}
                />
              </label>
            ) : (
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-slate-600">ФИО любого из трёх</span>
                <input
                  className="h-10 rounded-xl border border-slate-200 px-3 text-sm disabled:bg-slate-50"
                  value={anyName}
                  onChange={(e) => setAnyName(e.target.value)}
                  placeholder="Иванов Иван"
                  disabled={disabled}
                />
              </label>
            )}

            <button
              className={
                "mt-2 h-10 rounded-xl px-4 text-sm font-bold text-white " +
                (disabled ? "bg-orange-400 cursor-not-allowed" : "bg-orange-600 hover:bg-orange-700")
              }
              onClick={submit}
              disabled={disabled}
            >
              {submitting ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Spinner />
                  Проверяем…
                </span>
              ) : ok ? (
                "Готово"
              ) : (
                "Подтвердить"
              )}
            </button>

            <div ref={msgRef} className="grid gap-3">
              {err && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                  {err}
                </div>
              )}

              {ok && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  {ok.promoted ? (
                    <b>Готово: Вы в основном списке.</b>
                  ) : (
                    <b>Место уже заняли — заявка осталась в резерве.</b>
                  )}
                  {countdown != null && (
                    <div className="mt-2 text-sm text-emerald-800">
                      Возврат к турниру через <b>{countdown}</b> сек…
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}