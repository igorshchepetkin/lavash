// src/lib/supabasePublic.ts
/*
Purpose:
Browser-safe / low-privilege Supabase client configuration for public or non-privileged access.

Responsibilities:
1. Create the public Supabase client using anon credentials.
2. Be safe for use in non-privileged contexts.
3. Support read-only or explicitly allowed client-side operations if needed.

Important distinction:
- `supabaseAdmin` = privileged service-role backend client
- `supabasePublic` = public/anon client, safe for frontend use

Design intent:
Keep the security boundary explicit and prevent accidental use of the service-role client
in browser code.

Outcome:
Provides the public-side Supabase entrypoint where low-privilege access is required.
*/

import { createClient } from "@supabase/supabase-js";

export const supabasePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);