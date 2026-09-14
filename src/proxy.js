import { NextResponse } from "next/server";
import { isDev } from "./lib/utils";
import { routes } from "./config/routes";
import { getUser } from "./actions/auth";

const CRAWLABLE_PATHS = ["/sitemap.xml", "/robots.txt"];

/**
 * API paths customers reach without a dashboard session or the private
 * API key: the embeddable widget and the inbound channel webhooks. Each one
 * authenticates itself — the widget by channel public_key, Telegram by the
 * per-channel webhook secret — so the blanket x-api-key gate would only
 * break them.
 */
const PUBLIC_API_PREFIXES = ["/api/chat", "/api/channels/"];

export async function proxy(request) {
  const dev = isDev();
  const { pathname } = request.nextUrl;

  if (CRAWLABLE_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    const isPublic = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));

    if (!dev && !isPublic) {
      const api_key = request.headers.get("x-api-key");
      if (api_key !== process.env.API_KEY) {
        return NextResponse.json(
          { success: false, message: "Invalid api key" },
          { status: 401 },
        );
      }
    }
    return NextResponse.next();
  }

  const matchedRoute = routes.find((route) =>
    route.routes.some((r) => pathname === r || pathname.startsWith(r + "/")),
  );

  const needsAuth = matchedRoute?.access;

  if (needsAuth) {
    const { data: user } = await getUser();

    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    if (!matchedRoute.access.includes(user.role)) {
      return NextResponse.rewrite(new URL("/404", request.url));
    }
  }

  if (pathname.startsWith("/login")) {
    const { data: user } = await getUser();

    if (user) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  const response = NextResponse.next();

  if (!request.cookies.get("lang")) {
    // Absent on plenty of real requests — treating it as always present threw
    // on every such visit.
    const headerLanguage =
      request.headers.get("accept-language")?.split(",")[0]?.split("-")[0] || "en";
    response.cookies.set("lang", headerLanguage);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|xml|txt|js)$).*)",
  ],
};
