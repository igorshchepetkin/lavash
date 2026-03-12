// src/lib/supabaseAdmin.ts
/*
Purpose:
Server-side Supabase client configured with the Service Role key.

Responsibilities:
1. Create a privileged Supabase client for backend-only operations.
2. Allow trusted API routes and server helpers to:
   - read/write all application tables
   - bypass public client limitations
3. Keep all privileged DB access server-side only.

Important security rule:
- This file must never be imported into client components.
- Service Role credentials must never be exposed to the browser.

Typical usage:
- admin API routes
- tournament mutation endpoints
- auth/session management
- background cleanup / archive jobs

Design intent:
Provide one canonical privileged Supabase client instead of creating ad hoc clients
throughout the codebase.

Outcome:
Supplies the trusted database access layer for all backend business logic.
*/

import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-only
  { auth: { persistSession: false } }
);