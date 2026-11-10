/**
 * Link-preview images (WhatsApp, Facebook, X, iMessage…): 1200×630 PNGs drawn
 * at request time in the brand colours, with the arched-door illustration.
 * Pages with their own photo (products, recipes) use the photo instead.
 */
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

export function brandImage({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#F7F2E8", padding: "64px 72px", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 700 }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#965818", letterSpacing: 4, textTransform: "uppercase" }}>{eyebrow ?? "The Farm Door"}</div>
          <div style={{ display: "flex", fontSize: title.length > 28 ? 64 : 84, fontWeight: 700, color: "#1F3B2D", lineHeight: 1.05, marginTop: 20 }}>{title}</div>
          {subtitle && <div style={{ display: "flex", fontSize: 32, color: "#6A6158", marginTop: 24, lineHeight: 1.35 }}>{subtitle}</div>}
          <div style={{ display: "flex", fontSize: 26, color: "#1F3B2D", marginTop: 40, fontWeight: 700 }}>thefarmdoor.com</div>
        </div>
        <div style={{ display: "flex", width: 330, height: 450, borderTopLeftRadius: 165, borderTopRightRadius: 165, overflow: "hidden", border: "6px solid #1F3B2D" }}>
          <svg width="330" height="450" viewBox="0 0 380 520" preserveAspectRatio="xMidYMax slice">
            <defs>
              <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#E4AE58" />
                <stop offset=".42" stopColor="#F2D398" />
                <stop offset=".68" stopColor="#FAEBCB" />
              </linearGradient>
            </defs>
            <rect width="380" height="520" fill="url(#sky)" />
            <circle cx="190" cy="318" r="102" fill="#FFF7E2" opacity=".35" />
            <circle cx="190" cy="318" r="72" fill="#F0A93A" />
            <path d="M0 340C70 320 140 324 200 334S322 332 380 322V520H0Z" fill="#C6C894" />
            <path d="M0 364C88 342 170 350 250 364S346 370 380 356V520H0Z" fill="#97A96E" />
            <path d="M0 400C64 386 146 382 222 396S340 404 380 392V520H0Z" fill="#62814D" />
            <path d="M0 442C80 426 170 428 250 442S352 450 380 444V520H0Z" fill="#2F4F36" />
            <path d="M126 520C150 478 242 462 236 428C231 400 266 378 284 364L290 364C274 380 254 402 262 428C274 466 214 482 254 520Z" fill="#E2B57A" />
          </svg>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
