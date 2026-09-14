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
const PUBLIC_API_PREFIXES = [
  "/api/chat",       // the widget's own conversation endpoint (+ /messages)
  "/api/channels/",  // inbound provider webhooks
  "/api/widget",     // launcher appearance, read by third-party sites
];

export async function proxy(request) {
  const dev = isDev();
  const { pathname } = request.nextUrl;

  if (CRAWLABLE_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    const isPublic = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));

    // A CORS preflight carries no custom headers by definition, so it can
    // never satisfy the api-key gate. Rejecting it here produced the
    // misleading "No 'Access-Control-Allow-Origin'" error in the browser
    // rather than a readable 401.
    if (request.method === "OPTIONS") {
      return NextResponse.next();
    }

    if (!dev && !isPublic) {
      const api_key = request.headers.get("x-api-key");
      if (api_key !== process.env.API_KEY) {
        return NextResponse.json(
          { success: false, message: "Invalid api key" },
          {
            status: 401,
            // Without these the browser reports a CORS failure instead of
            // the actual reason the request was refused.
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Headers": "Content-Type, ngrok-skip-browser-warning",
            },
          },
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
