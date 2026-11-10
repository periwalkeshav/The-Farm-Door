/**
 * Runs before every page request.
 *
 * Languages: shop pages live in app/[lang]. English keeps plain addresses
 * (/shop is served from /en/shop behind the scenes); Hindi pages are at /hi/….
 * A visitor who chose Hindi (cookie) and opens a plain address is sent to the
 * Hindi page, so emailed links still land in their language.
 *
 * Admin: every admin request gets a fresh nonce and a strict Content Security
 * Policy (see src/lib/csp.ts); Next.js adds the nonce to its own scripts.
 */
import { NextResponse, type NextRequest } from "next/server";
import { LANG_COOKIE, localePath } from "@/i18n/config";
import { adminCsp, newNonce } from "@/lib/csp";

const YEAR = 60 * 60 * 24 * 365;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];

  if (first === "admin") return withAdminCsp(request);

  if (first === "hi") {
    const response = NextResponse.next();
    // Remember the choice when someone opens a Hindi page (only for real page loads).
    if (isPageLoad(request) && request.cookies.get(LANG_COOKIE)?.value !== "hi") response.cookies.set(LANG_COOKIE, "hi", { path: "/", maxAge: YEAR, sameSite: "lax" });
    return response;
  }

  if (first === "en") {
    // /en/… is the internal form of English addresses; send people to the plain one.
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url, 308);
  }

  if (request.cookies.get(LANG_COOKIE)?.value === "hi" && request.method === "GET" && isPageLoad(request)) {
    const url = request.nextUrl.clone();
    url.pathname = localePath("hi", pathname);
    return NextResponse.redirect(url);
  }

  const url = request.nextUrl.clone();
  url.pathname = `/en${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

function withAdminCsp(request: NextRequest) {
  const nonce = newNonce();
  const policy = adminCsp(nonce);
  const headers = new Headers(request.headers);
  // Next.js reads the nonce from the request's policy while rendering; the layout reads x-nonce for its own script.
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

/** A full page load in the browser (not the router fetching data for a page already open). */
function isPageLoad(request: NextRequest) {
  return !request.headers.has("rsc") && !request.headers.has("next-router-prefetch") && !request.headers.has("next-action");
}

export const config = {
  matcher: [
    // Everything except APIs, Next.js files, images, feeds and metadata files.
    "/((?!api|_next|media|feeds|icon\\.svg|apple-icon\\.png|robots\\.txt|sitemap\\.xml|favicon\\.ico).*)",
  ],
};
