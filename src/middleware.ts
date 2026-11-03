import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const pathname = request.nextUrl.pathname;

  // /invite is completely excluded from all middleware auth logic.
  //
  // The Supabase invite flow delivers the session token as a URL hash fragment
  // (#access_token=...). Hash fragments are never sent to the server — the
  // middleware and getUser() cannot see them. This means:
  //   - On first load: getUser() returns null (token not yet exchanged)
  //   - After exchange: getUser() returns a user (session established)
  //
  // In BOTH cases the agent must stay on /invite:
  //   - Before exchange: they need to wait for token processing
  //   - After exchange: they need to set their password
  //
  // Applying ANY auth redirect to /invite breaks the flow in one of those two
  // states. The only safe choice is to bypass the route entirely.
  if (pathname.startsWith("/invite")) {
    return response;
  }

  // Payment-provider webhooks are server-to-server calls with no login cookie.
  // They authenticate themselves with a signature (verified inside the route),
  // so they must bypass the login redirect or they never arrive.
  if (pathname.startsWith("/api/webhooks")) {
    return response;
  }

  // Public page the client lands on after paying (they are not signed in).
  if (pathname.startsWith("/payment-received")) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: CookieOptions;
          }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const publicPaths = ["/login"];
  const isPublicPath = publicPaths.some((p) => pathname.startsWith(p));

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (user && pathname.startsWith("/admin")) {
    const role = user.app_metadata?.role as string | undefined;
    if (role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
