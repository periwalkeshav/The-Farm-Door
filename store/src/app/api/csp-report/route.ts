import { getDb } from "@/db";
import { clientIp } from "@/data/request";
import { env } from "@/lib/env";
import { recordError } from "@/server/errors";
import { hitRateLimit } from "@/server/rate-limit";

type Violation = { documentUrl: string; directive: string; blocked: string; sourceFile: string; line: number | null; disposition: string };

/**
 * Something on one of our pages that the Content Security Policy blocked
 * (src/lib/csp.ts). Usually a sign that a payment or analytics provider
 * changed an address, or a browser extension interfering. Listed in
 * Admin > Site errors like browser errors.
 */
export async function POST(request: Request) {
  const db = getDb();
  if (!(await hitRateLimit(db, `csp-report:${await clientIp()}`, 20, 600)).allowed) return new Response(null, { status: 204 });
  const body = await request.text();
  if (body.length > 20_000) return new Response(null, { status: 413 });
  let violations: Violation[];
  try {
    violations = parse(JSON.parse(body));
  } catch {
    return new Response(null, { status: 400 });
  }
  const origin = new URL(env().APP_URL).origin;
  for (const v of violations.slice(0, 5)) {
    if (!worthRecording(v, origin)) continue;
    try {
      await recordError(db, {
        source: "browser",
        message: `Security policy blocked ${v.blocked || "an inline script or style"} (${v.directive}${v.disposition === "report" ? ", report only" : ""})`,
        path: new URL(v.documentUrl).pathname,
        stack: v.sourceFile ? `${v.sourceFile}${v.line ? `:${v.line}` : ""}` : undefined,
      });
    } catch (err) {
      console.error("[csp] could not record a report:", err);
    }
  }
  return new Response(null, { status: 204 });
}

const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 500) : "");

/** Both report formats: the older `report-uri` one and the Reporting API (`report-to`). */
function parse(json: unknown): Violation[] {
  if (json && typeof json === "object" && "csp-report" in json) {
    const r = (json as { "csp-report": Record<string, unknown> })["csp-report"] ?? {};
    return [{ documentUrl: str(r["document-uri"]), directive: str(r["effective-directive"]) || str(r["violated-directive"]), blocked: str(r["blocked-uri"]), sourceFile: str(r["source-file"]), line: Number(r["line-number"]) || null, disposition: str(r.disposition) }];
  }
  if (Array.isArray(json)) {
    return json
      .filter((r) => r && typeof r === "object" && r.type === "csp-violation" && r.body && typeof r.body === "object")
      .map((r) => {
        const b = r.body as Record<string, unknown>;
        return { documentUrl: str(b.documentURL) || str(r.url), directive: str(b.effectiveDirective), blocked: str(b.blockedURL), sourceFile: str(b.sourceFile), line: Number(b.lineNumber) || null, disposition: str(b.disposition) };
      });
  }
  return [];
}

/** Only reports about our own pages, and not the noise browser extensions cause. */
function worthRecording(v: Violation, origin: string) {
  let url: URL;
  try {
    url = new URL(v.documentUrl);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false;
  return !/^(chrome|moz|safari|safari-web|ms-browser)-extension:|^(about|data):/.test(v.blocked) && !/-extension:/.test(v.sourceFile);
}
