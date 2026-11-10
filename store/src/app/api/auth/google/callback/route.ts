import { cookies } from "next/headers";
import { getDb } from "@/db";
import { cookieName, cookieOptions } from "@/data/cookies";
import { clientIp, userAgent } from "@/data/request";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { customerFromGoogle } from "@/server/auth/customer";
import { createSession } from "@/server/auth/sessions";
import { mergeIntoCustomerCart } from "@/server/cart";

function fail() {
  return Response.redirect(`${env().APP_URL}/login?error=google`, 302);
}

/** Completes Google sign-in: verifies state, exchanges the code, reads the verified email from the ID token. */
export async function GET(request: Request) {
  const e = env();
  const params = new URL(request.url).searchParams;
  const jar = await cookies();
  const saved = jar.get("tfd_oauth")?.value;
  jar.delete("tfd_oauth");
  if (!saved || !e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) return fail();
  const { state, verifier, next } = JSON.parse(saved) as { state: string; verifier: string; next: string };
  const code = params.get("code");
  if (!code || !safeEqual(state, params.get("state") ?? "")) return fail();

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: e.GOOGLE_CLIENT_ID,
      client_secret: e.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${e.APP_URL}/api/auth/google/callback`,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!tokenRes.ok) return fail();
  const { id_token: idToken } = (await tokenRes.json()) as { id_token?: string };
  if (!idToken) return fail();
  // The ID token came directly from Google over TLS in exchange for our secret, so its claims can be read without re-verifying the signature.
  const claims = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString()) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    aud: string;
    iss: string;
    exp: number;
  };
  if (claims.aud !== e.GOOGLE_CLIENT_ID || !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss) || claims.exp * 1000 < Date.now() || !claims.email) return fail();

  const db = getDb();
  let customerId: number;
  try {
    customerId = await customerFromGoogle(db, { sub: claims.sub, email: claims.email, emailVerified: !!claims.email_verified, name: claims.name ?? "" });
  } catch {
    return fail();
  }
  const { token, expiresAt } = await createSession(db, "CUSTOMER", customerId, { ip: await clientIp(), userAgent: await userAgent() });
  jar.set(cookieName("session"), token, cookieOptions({ expires: expiresAt }));
  const cartId = await mergeIntoCustomerCart(db, jar.get(cookieName("cart"))?.value ?? null, customerId);
  jar.set(cookieName("cart"), cartId, cookieOptions({ maxAgeSeconds: 60 * 24 * 60 * 60 }));
  return Response.redirect(`${e.APP_URL}${next}`, 302);
}
