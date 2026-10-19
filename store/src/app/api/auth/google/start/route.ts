import { cookies } from "next/headers";
import { connection } from "next/server";
import { cookieOptions } from "@/data/cookies";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { env } from "@/lib/env";

/** Starts "Continue with Google" (OAuth 2.0 authorization code flow with PKCE). */
export async function GET(request: Request) {
  await connection(); // always run per request (configuration is read at runtime)
  const e = env();
  if (!e.GOOGLE_CLIENT_ID) return new Response("Google sign-in isn't configured.", { status: 404 });
  const next = new URL(request.url).searchParams.get("next") ?? "/account";
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = Buffer.from(sha256Hex(verifier), "hex").toString("base64url");
  const jar = await cookies();
  jar.set("tfd_oauth", JSON.stringify({ state, verifier, next: next.startsWith("/") && !next.startsWith("//") ? next : "/account" }), cookieOptions({ maxAgeSeconds: 600 }));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: e.GOOGLE_CLIENT_ID,
    redirect_uri: `${e.APP_URL}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return Response.redirect(url.toString(), 302);
}
