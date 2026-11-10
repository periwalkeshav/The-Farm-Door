/**
 * Content Security Policies: which scripts, styles, frames and connections a
 * page may use. Browsers send what a policy blocks to /api/csp-report, which
 * lists it in Admin > Site errors.
 *
 * - Shop: a fixed policy (set in next.config.ts) so pages can stay partly
 *   pre-rendered and cached. Inline scripts are allowed because pre-rendered
 *   pages can't carry a per-request nonce.
 * - Admin: a strict policy with a fresh nonce for every request (set in
 *   src/proxy.ts). Only scripts carrying that nonce, and scripts they load,
 *   can run. Admin pages are rendered per request anyway (they depend on the
 *   signed-in staff member), so this costs nothing extra.
 */
const isDev = process.env.NODE_ENV !== "production";

export const CSP_REPORT_PATH = "/api/csp-report";

/** Sent with every page so newer browsers know where "report-to csp" goes. */
export const REPORTING_ENDPOINTS = `csp="${CSP_REPORT_PATH}"`;

const reporting = [`report-uri ${CSP_REPORT_PATH}`, "report-to csp"];

/** Razorpay Checkout needs its script, frames and API; Google Analytics loads only after a visitor accepts analytics cookies; Google sign-in is a plain redirect. */
export const SHOP_CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://www.googletagmanager.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.razorpay.com https://*.google-analytics.com https://*.googletagmanager.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.razorpay.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ...reporting,
].join("; ");

/**
 * The admin panel: no third-party scripts at all. Styles keep 'unsafe-inline'
 * because style="" attributes (progress bars, widths) can't carry a nonce;
 * injected styles can't run code.
 */
export function adminCsp(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    // The email log shows each email in a sandboxed frame.
    "frame-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
    ...reporting,
  ].join("; ");
}

/** A random nonce for one response (base64, as CSP expects). */
export function newNonce() {
  return btoa(crypto.randomUUID());
}
