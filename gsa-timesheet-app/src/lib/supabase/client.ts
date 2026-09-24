"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Safe to import from client components —
// uses the public anon key, which is meant to be exposed; RLS is what
// actually protects the data (see supabase/migrations/0002_rls.sql).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
