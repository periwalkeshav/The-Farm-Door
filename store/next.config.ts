import type { NextConfig } from "next";

import { REPORTING_ENDPOINTS, SHOP_CSP } from "./src/lib/csp";

const isDev = process.env.NODE_ENV !== "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://checkout.razorpay.com\" \"https://api.razorpay.com\")" },
  // Keeps other sites' windows from reaching into ours; Razorpay's payment pop-ups (some UPI and bank flows) still work.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Reporting-Endpoints", value: REPORTING_ENDPOINTS },
  // HTTPS only, remembered for a year (production only; browsers ignore it on plain http anyway).
  // Not includeSubDomains/preload: add those only once every subdomain (email, coming-soon page) is on HTTPS.
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  serverExternalPackages: ["sharp", "pg", "pdfkit"],
  experimental: {
    // Product photo uploads go through server actions.
    serverActions: { bodySizeLimit: "10mb" },
    // The shop (app/[lang]) and admin have separate root layouts, so unmatched addresses use app/global-not-found.tsx.
    globalNotFound: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The admin panel gets a stricter policy with a per-request nonce from src/proxy.ts.
      { source: "/((?!admin(?:/|$)).*)", headers: [{ key: "Content-Security-Policy", value: SHOP_CSP }] },
    ];
  },
};

export default nextConfig;
