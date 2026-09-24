import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles the redirect back from Google via Supabase Auth. Exchanges the
// OAuth code for a session, then sends the person into the app. If the
// handle_new_user() trigger rejected the sign-in (wrong domain), the code
// exchange itself fails and we bounce back to /login with an error.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(
      "Sign-in failed — your account may not be on an allowed Workspace domain. Contact your admin."
    )}`
  );
}
