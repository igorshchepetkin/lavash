"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

export default function WithdrawPage() {
  const params = useParams();
  const tournamentId = (params as any).id as string;
  const sp = useSearchParams();
  const code = sp.get("code") ?? "";

  const [status, setStatus] = useState<"idle"|"ok"|"err">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function withdraw() {
    setErr(null);
    const res = await fetch(`/api/tournament/${tournamentId}/withdraw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancel_code: code }),
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;

    if (!res.ok) {
      setErr(json?.error?.message ?? json?.error ?? "Ошибка");
      setStatus("err");
      return;
    }
    setStatus("ok");
  }

  useEffect(() => {
    if (tournamentId && code) withdraw();
  }, [tournamentId, code]);

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-2xl font-extrabold tracking-tight">Отзыв заявки</h1>

        {status === "idle" && (
          <div className="mt-6 text-sm text-slate-600">Проверяем код…</div>
        )}

        {status === "ok" && (
          <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-5">
            <div className="text-lg font-extrabold">Заявка отозвана ✅</div>
            <div className="mt-2 text-sm text-slate-700">
              Если турнир ещё не стартовал — судья больше не увидит эту заявку как активную.
            </div>
          </div>
        )}

        {status === "err" && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">
            {err}
          </div>
        )}
      </div>
    </main>
  );
}