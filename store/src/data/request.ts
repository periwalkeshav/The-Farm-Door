import "server-only";
import { headers } from "next/headers";
import { env } from "@/lib/env";

/**
 * Best-effort client IP for rate limiting and the audit log.
 *
 * With TRUST_CLOUDFLARE=true it's Cloudflare's CF-Connecting-IP, which Cloudflare sets itself (a visitor
 * can't fake it when every request passes through Cloudflare: your own Cloudflare zone, or Render, whose
 * edge runs on Cloudflare). Otherwise the first X-Forwarded-For entry; some hosts (Render among them) keep
 * whatever the visitor sent there, so that value can be faked to dodge rate limits. See DEPLOYMENT.md.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const cloudflare = env().TRUST_CLOUDFLARE === "true" ? h.get("cf-connecting-ip") : null;
  return (cloudflare ?? h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim().slice(0, 64);
}

export async function userAgent(): Promise<string> {
  return ((await headers()).get("user-agent") ?? "").slice(0, 300);
}
