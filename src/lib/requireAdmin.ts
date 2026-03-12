// src/lib/requireAdmin.ts
/*
Purpose:
Legacy/simple admin guard helper kept for compatibility or lightweight route protection.

Responsibilities:
1. Resolve current admin session/user.
2. Reject non-authenticated requests.
3. Optionally enforce a simpler ADMIN-only policy.

Relationship to newer auth helpers:
- In projects with richer RBAC, more expressive checks may live in `adminAuth.ts`.
- This file may remain as a thin wrapper for ADMIN-only routes or legacy endpoints.

Design intent:
Preserve a small reusable guard for endpoints that need only "is authenticated admin"
logic without tournament-specific role branching.

Outcome:
Provides a compact route guard abstraction for simple admin-only operations.
*/

import { requirePlatformAdminOr401 } from "@/lib/adminAccess";

export async function requireAdmin() {
  const ctx = await requirePlatformAdminOr401();
  if (!ctx) throw new Error("NOT_ADMIN");
  return ctx;
}
