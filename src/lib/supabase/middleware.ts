import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase auth session on every request and redirects signed
// out users to /login. Mirrors the recommended @supabase/ssr middleware
// pattern. Called from src/middleware.ts.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = path.startsWith("/login") || path.startsWith("/auth");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && path.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Pass the already-verified user id to Server Components via a request
  // header, so getCurrentAgent() doesn't need to re-verify the session with
  // a second network round trip to Supabase Auth on every single request.
  if (user) {
    const headers = new Headers(request.headers);
    headers.set("x-user-id", user.id);
    const finalResponse = NextResponse.next({ request: { headers } });
    supabaseResponse.cookies.getAll().forEach((c) => {
      finalResponse.cookies.set(c.name, c.value, c);
    });
    return finalResponse;
  }

  return supabaseResponse;
}
