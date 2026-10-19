import "server-only";
import { env } from "@/lib/env";

const secure = () => env().APP_URL.startsWith("https://");

/** In production (HTTPS) session cookies use the __Host- prefix, which browsers lock to this exact site. */
export function cookieName(base: "session" | "admin" | "cart") {
  const name = `tfd_${base}`;
  return secure() && base !== "cart" ? `__Host-${name}` : name;
}

export function cookieOptions(opts: { maxAgeSeconds?: number; sameSite?: "lax" | "strict"; expires?: Date } = {}) {
  return {
    httpOnly: true,
    secure: secure(),
    sameSite: opts.sameSite ?? ("lax" as const),
    path: "/",
    ...(opts.expires ? { expires: opts.expires } : {}),
    ...(opts.maxAgeSeconds ? { maxAge: opts.maxAgeSeconds } : {}),
  };
}
