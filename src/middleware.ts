import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  SESSION_COOKIE_NAME,
  verifySessionTokenEdge,
  isProductionEnvironment,
} from "@/lib/auth/session-edge";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const pathname = request.nextUrl.pathname;
  let isAuthenticated = false;

  // 1. Check Supabase Auth if credentials configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    try {
      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      });

      const { data: { user }, error } = await supabase.auth.getUser();
      if (!error && user) {
        isAuthenticated = true;
      }
    } catch {
      // Supabase connection or cookie failure
    }
  }

  // 2. Check signed KanzleiFlow session cookie
  if (!isAuthenticated) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (sessionCookie) {
      const verified = await verifySessionTokenEdge(sessionCookie);
      if (verified) {
        isAuthenticated = true;
      }
    }
  }

  const isProd = isProductionEnvironment();
  const allowDemo = !isProd && process.env.ALLOW_DEMO_AUTH !== "false" && process.env.REQUIRE_AUTH !== "true";

  // 3. Route Protection: /cases and subpaths
  const isCasesRoute = pathname === "/cases" || pathname.startsWith("/cases/");
  if (isCasesRoute) {
    if (!isAuthenticated && !allowDemo) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // 4. API Protection: /api/cases, /api/documents, /api/drafts
  const isProtectedApiRoute =
    pathname.startsWith("/api/cases") ||
    pathname.startsWith("/api/documents") ||
    pathname.startsWith("/api/drafts");

  if (isProtectedApiRoute) {
    if (!isAuthenticated && !allowDemo) {
      return NextResponse.json(
        { error: "Nicht authentifiziert. Bitte melden Sie sich an." },
        { status: 401 }
      );
    }
  }

  // 5. If already authenticated and visiting /login, redirect to /cases
  if (pathname === "/login" && isAuthenticated) {
    return NextResponse.redirect(new URL("/cases", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (assets, svgs, images)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
