"use client";

import { useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const origin = window.location.origin;
    const domain = process.env.NEXT_PUBLIC_WORKSPACE_DOMAIN;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback`,
        // Restricts Google's account chooser to this Workspace domain.
        // This is a UX nicety only — the real enforcement is server-side,
        // in the handle_new_user() trigger (supabase/migrations/0002_rls.sql),
        // which rejects any email outside allowed_domains regardless of what
        // Google itself allowed through.
        queryParams: domain ? { hd: domain } : undefined,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f9f9f7] px-4">
      <div className="w-full max-w-sm bg-[#fcfcfb] border border-[#e1e0d9] rounded-xl p-8 text-center">
        <Image
          src="/gsa-logo.png"
          alt="GSA Business Development"
          width={400}
          height={131}
          priority
          className="h-14 w-auto mx-auto mb-5"
        />
        <h1 className="text-lg font-semibold text-[#0b0b0b] mb-1">GSA Timesheet</h1>
        <p className="text-sm text-[#898781] mb-6">
          Sign in with your Workspace Google account to continue.
        </p>
        <button
          onClick={signInWithGoogle}
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-[#c3c2b7] bg-white px-4 py-2.5 text-sm font-medium text-[#0b0b0b] hover:bg-[#f3f2ee] disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.9 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.5 29.6 4.5 24 4.5 12.7 4.5 3.5 13.7 3.5 25S12.7 45.5 24 45.5 44.5 36.3 44.5 25c0-1.5-.2-3-.5-4.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.5 29.6 4.5 24 4.5c-7.7 0-14.4 4.4-17.7 10.2z" />
            <path fill="#4CAF50" d="M24 45.5c5.5 0 10.4-1.9 14.2-5.1l-6.6-5.4C29.6 36.5 26.9 37.5 24 37.5c-5.4 0-9.9-3.1-11.3-7.9l-6.6 5.1C9.6 41.1 16.3 45.5 24 45.5z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2-2 3.7-3.7 4.9l6.6 5.4C41.9 35.6 44.5 30.7 44.5 25c0-1.5-.2-3-.9-4.5z" />
          </svg>
          {loading ? "Redirecting…" : "Continue with Google"}
        </button>
        {error && <p className="mt-4 text-sm text-[#d03b3b]">{error}</p>}
        <p className="mt-6 text-xs text-[#898781]">
          Access is limited to agents provisioned on the company Google Workspace.
        </p>
      </div>
    </div>
  );
}
