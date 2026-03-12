// src/components/TournamentTabs.tsx
/*
Purpose:
Reusable inner navigation for one tournament inside the admin panel.

UI role:
Shows the 3 main working sections of a tournament:
- Registrations
- Matches
- Tournament settings

Behavior:
1. Receives `tournamentId`.
2. Builds route targets:
   - /admin/t/[id]/registrations
   - /admin/t/[id]/ops
   - /admin/t/[id]/settings
3. Detects current pathname via `usePathname()`.
4. Highlights the active tab using neutral active-state styling
   (not the orange primary-action style).
5. Keeps navigation visually lightweight and consistent across all tournament pages.

Design intent:
- Tabs represent current location, not a primary action.
- Orange is reserved for important commands like Save / Create / Start.
- Active tab styling should therefore be state-like, not CTA-like.

Outcome:
Provides stable contextual navigation inside the current tournament.
*/

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function TournamentTabs({ tournamentId }: { tournamentId: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/admin/t/${tournamentId}/registrations`, label: "Заявки" },
    { href: `/admin/t/${tournamentId}/ops`, label: "Матчи" },
    { href: `/admin/t/${tournamentId}/settings`, label: "Настройки турнира" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const active = pathname === tab.href;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={[
              "rounded-xl border px-3 py-2 text-sm font-semibold transition-colors",
              active
                ? "border-slate-300 bg-slate-100 text-slate-900"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}