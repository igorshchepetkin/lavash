// src/components/AdminLayoutClient.tsx
/*
Purpose:
Top-level authenticated admin shell with sidebar navigation, session validation,
role-based visibility, and logout handling.

Responsibilities:
1. Resolve current pathname.
2. Load current session/user via `/api/admin/auth/me`.
3. Redirect unauthenticated users to `/admin`.
4. Redirect users with forced password change / expired password to `/admin/change-password`.
5. Render public login/password-change pages without admin shell.
6. Render authenticated admin shell for all other admin pages.

Sidebar responsibilities:
- Show current admin user name and login.
- Show primary navigation:
  - Турниры
  - Архив турниров
- Show admin-only section:
  - Пользователи
  - Параметры авторизации
  - Лог авторизации
- Highlight active section based on pathname groups.

Important routing rule:
The “Турниры” sidebar item is active not only for `/admin/tournaments`,
but also for nested tournament routes like:
- /admin/t/[id]/registrations
- /admin/t/[id]/ops
- /admin/t/[id]/settings

Session behavior:
- Calls `/api/admin/auth/me` initially
- Refreshes session state every 60 seconds
- Supports sliding idle timeout behavior from backend

Outcome:
Provides the persistent admin workspace shell and enforces authentication/authorization UX.
*/

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/adminClient";


type MePayload = {
  user: {
    id: string;
    first_name: string;
    last_name: string;
    login: string;
    roles: string[];
    must_change_password: boolean;
  };
  must_change_password: boolean;
  password_expired: boolean;
};

function NavLink({
  href,
  children,
  active,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  const pathname = usePathname();
  const isActive = active ?? (pathname === href || pathname.startsWith(href + "/"));

  return (
    <Link
      href={href}
      className={`block rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${isActive ? "bg-orange-100 text-orange-700" : "text-slate-700 hover:bg-slate-100"
        }`}
      style={
        isActive
          ? {
            borderLeft: "4px solid #EA580C",
          }
          : {
            borderLeft: "4px solid transparent",
          }
      }
    >
      {children}
    </Link>
  );
}

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<MePayload | null>(null);
  const [ready, setReady] = useState(false);

  const isLoginPage = pathname === "/admin";
  const isPasswordPage = pathname === "/admin/change-password";

  async function loadMe(silent = false) {
    const res = await fetch("/api/admin/auth/me", { cache: "no-store" });

    if (res.status === 401) {
      setMe(null);
      if (!isLoginPage) router.replace("/admin");
      setReady(true);
      return;
    }

    const json = await res.json();
    setMe(json);
    setReady(true);

    if (!silent) {
      if ((json?.must_change_password || json?.password_expired) && !isPasswordPage) {
        router.replace("/admin/change-password");
        return;
      }

      if (!(json?.must_change_password || json?.password_expired) && isLoginPage) {
        router.replace("/admin/tournaments");
      }
    }
  }

  useEffect(() => {
    loadMe();
    const id = window.setInterval(() => loadMe(true), 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const roles = useMemo(() => new Set(me?.user?.roles ?? []), [me?.user?.roles]);

  const tournamentsActive =
    pathname === "/admin/tournaments" || pathname.startsWith("/admin/t/");

  const archiveActive = pathname === "/admin/archive";
  const usersActive = pathname === "/admin/admin/users";
  const authSettingsActive = pathname === "/admin/admin/auth-settings";
  const authLogActive = pathname === "/admin/admin/auth-log";

  async function logout() {
    await adminFetch("/api/admin/auth/logout", { method: "POST" });
    window.location.href = "/admin";
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-600 border-t-transparent" />
        </div>
      </main>
    );
  }

  if (isLoginPage || isPasswordPage || !me) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="border-b border-slate-100 pb-4">
            <div className="text-xl font-extrabold text-slate-900">Лаваш Admin</div>
            <div className="mt-2 text-sm text-slate-500">
              {me.user.last_name} {me.user.first_name}
            </div>
            <div className="text-xs text-slate-400">{me.user.login}</div>
          </div>

          <nav className="mt-4 space-y-1">
            <NavLink href="/admin/tournaments" active={tournamentsActive}>
              Турниры
            </NavLink>

            <NavLink href="/admin/archive" active={archiveActive}>
              Архив турниров
            </NavLink>

            {roles.has("ADMIN") && (
              <>
                <div className="px-3 pt-4 text-xs font-bold uppercase tracking-wide text-slate-400">
                  Администрирование
                </div>

                <NavLink href="/admin/admin/users" active={usersActive}>
                  Пользователи
                </NavLink>

                <NavLink href="/admin/admin/auth-settings" active={authSettingsActive}>
                  Параметры авторизации
                </NavLink>

                <NavLink href="/admin/admin/auth-log" active={authLogActive}>
                  Лог авторизации
                </NavLink>
              </>
            )}
          </nav>

          <button
            className="mt-6 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            onClick={logout}
          >
            Выйти
          </button>
        </aside>

        <div>{children}</div>
      </div>
    </div>
  );
}