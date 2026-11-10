"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { cookieName, cookieOptions } from "@/data/cookies";
import { clientIp, userAgent } from "@/data/request";
import { loginEmailSchema } from "@/lib/form-schemas";
import { requestLoginCode, verifyLoginCode } from "@/server/auth/customer";
import { createSession, deleteSessionByToken } from "@/server/auth/sessions";
import { mergeIntoCustomerCart } from "@/server/cart";
import { RateLimitError } from "@/server/rate-limit";

export type LoginState = { stage: "email" | "code"; email: string; message: string | null; error: boolean } | null;

/** Only allow redirects back into this site. */
function safeNext(next: unknown): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/account";
}

export async function loginAction(prev: LoginState, formData: FormData): Promise<LoginState> {
  const db = getDb();
  const ip = await clientIp();
  const email = String(formData.get("email") ?? "").trim();
  if (!loginEmailSchema.safeParse({ email }).success) return { stage: "email", email, message: "Enter a valid email address, like name@example.com.", error: true };

  if (formData.get("intent") !== "verify") {
    try {
      await requestLoginCode(db, email, ip);
      return { stage: "code", email, message: `We've sent a 6-digit code to ${email}.`, error: false };
    } catch (err) {
      return { stage: "email", email, message: err instanceof RateLimitError || err instanceof Error ? err.message : "Please try again.", error: true };
    }
  }

  let result;
  try {
    result = await verifyLoginCode(db, email, String(formData.get("code") ?? ""), ip);
  } catch (err) {
    if (err instanceof RateLimitError) return { stage: "code", email, message: err.message, error: true };
    throw err;
  }
  if (!result.ok) return { stage: "code", email, message: result.reason, error: true };

  const jar = await cookies();
  const { token, expiresAt } = await createSession(db, "CUSTOMER", result.customerId, { ip, userAgent: await userAgent() });
  jar.set(cookieName("session"), token, cookieOptions({ expires: expiresAt }));
  const cartId = await mergeIntoCustomerCart(db, jar.get(cookieName("cart"))?.value ?? null, result.customerId);
  jar.set(cookieName("cart"), cartId, cookieOptions({ maxAgeSeconds: 60 * 24 * 60 * 60 }));
  redirect(safeNext(formData.get("next")));
}

export async function signOutAction() {
  const jar = await cookies();
  const token = jar.get(cookieName("session"))?.value;
  if (token) await deleteSessionByToken(getDb(), token);
  jar.delete(cookieName("session"));
  jar.delete(cookieName("cart"));
  redirect("/");
}
