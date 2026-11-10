/**
 * Placeholder product illustrations for the SAMPLE catalogue (development only).
 * Each image is labelled "Sample image" and must be replaced with real photos.
 */

export type ArtKind = "powder" | "seeds" | "pepper" | "cardamom" | "cinnamon" | "anise" | "bay" | "chilli" | "masala" | "dal" | "rice" | "nuts" | "bottle" | "jar";

const anise = (x: number, y: number, s: number, r = 0) => `
<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">
  ${[0, 45, 90, 135, 180, 225, 270, 315]
    .map(
      (a) => `<g transform="rotate(${a})"><path d="M0-6C9-14 11-30 0-47C-11-30-9-14 0-6Z" fill="#8C4A26"/><path d="M-5.5-15C-7-25-4-36 0-44" stroke="#B06A3C" stroke-width="1.4" fill="none"/><ellipse cx="0" cy="-27" rx="3.4" ry="6.4" fill="#E0AC6C" stroke="#5E2F17" stroke-width=".9"/></g>`,
    )
    .join("")}
  <circle r="7.5" fill="#6B3519"/>
</g>`;

const chilli = (x: number, y: number, s: number, r = 0) => `
<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">
  <path d="M30 22C60 10 110 12 152 52C150 54 147 55 144 54C110 36 70 38 34 44C24 44 20 26 30 22Z" fill="#C23B26"/>
  <path d="M44 24C74 17 106 20 132 36" stroke="#E5684D" stroke-width="3" stroke-linecap="round" fill="none"/>
  <path d="M34 20C24 18 18 26 20 33C18 41 26 47 35 44C30 38 29 27 34 20Z" fill="#4E7A3A"/>
  <path d="M21 32C12 31 7 25 6 16" stroke="#4E7A3A" stroke-width="4" stroke-linecap="round" fill="none"/>
</g>`;

const cinnamon = (x: number, y: number, s: number, r = 0) => `
<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">
  <rect x="20" y="16" width="136" height="22" rx="11" fill="#A9603A"/>
  <path d="M32 22H146" stroke="#8B4A2A" stroke-width="1.6"/><path d="M36 31H140" stroke="#C27D50" stroke-width="1.6"/>
  <ellipse cx="22" cy="27" rx="7" ry="11" fill="#CB8A5C"/>
  <path d="M22 19.5c4 .5 4.5 14.5 0 15-3.5-.5-3.5-11 0-11 2 .5 2 7 0 7" fill="none" stroke="#7A3F21" stroke-width="1.5"/>
</g>`;

const cardamom = (x: number, y: number, s: number, r = 0) => `
<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">
  <path d="M6 18C16 6 46 4 66 16C68 18 68 19 66 20C46 32 16 30 6 18Z" fill="#9BB766"/>
  <path d="M12 18C28 12 48 12 62 17M12 18C28 24 48 24 62 19" stroke="#6F8B40" stroke-width="1.3" fill="none"/>
  <path d="M66 18h6" stroke="#6F8B40" stroke-width="2.2" stroke-linecap="round"/>
</g>`;

const bay = (x: number, y: number, s: number, r = 0) => `
<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">
  <path d="M14 30C42 6 100 2 144 28C100 52 42 54 14 30Z" fill="#7F9C5B"/>
  <path d="M18 30C58 27 100 26 140 28" stroke="#5C7A3C" stroke-width="1.6" fill="none"/>
  <path d="M46 29 58 17M66 28l12-13M86 27l12-11M46 30l12 11M66 29l12 13M86 28l12 12" stroke="#6C8A4A" stroke-width="1.2"/>
</g>`;

const peppercorn = (x: number, y: number, s: number) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><circle r="9" fill="#2E2520"/><circle cx="-3" cy="-3" r="2.6" fill="#6E5C4D"/></g>`;

const seed = (x: number, y: number, r: number, color: string) =>
  `<g transform="translate(${x} ${y}) rotate(${r})"><ellipse rx="11" ry="4.2" fill="${color}"/><path d="M-8 0H8" stroke="#00000033" stroke-width="1.2"/></g>`;

const lentil = (x: number, y: number, color: string) => `<g transform="translate(${x} ${y})"><circle r="9" fill="${color}"/><circle cx="-2.5" cy="-2.5" r="2.4" fill="#FFFFFF44"/></g>`;

const grain = (x: number, y: number, r: number) =>
  `<g transform="translate(${x} ${y}) rotate(${r})"><ellipse rx="15" ry="3.6" fill="#FBF7EC" stroke="#D9CDB4" stroke-width="1"/></g>`;

const almond = (x: number, y: number, r: number) =>
  `<g transform="translate(${x} ${y}) rotate(${r}) scale(1.6)"><path d="M0-16C9-10 10 8 0 16C-10 8-9-10 0-16Z" fill="#B0683A"/><path d="M-2-10C-5-2-4 6-1 11" stroke="#8C4A26" stroke-width="1.4" fill="none"/></g>`;

const cashew = (x: number, y: number, r: number) =>
  `<g transform="translate(${x} ${y}) rotate(${r}) scale(1.7)"><path d="M-10 8c-2-14 8-26 20-24 4 1 4 6 0 7-7 1-11 8-10 16 0 4-9 6-10 1Z" fill="#EBD3A2" stroke="#D4B77F" stroke-width="1"/></g>`;

/** An oil bottle standing where the bowl usually is. */
function bottle(color: string) {
  return `
  <rect x="560" y="190" width="80" height="60" rx="12" fill="#1F3B2D"/>
  <path d="M570 250h60v90c0 30 110 60 110 150v330c0 40-30 70-70 70H530c-40 0-70-30-70-70V490c0-90 110-120 110-150Z" fill="${color}" opacity=".95"/>
  <path d="M470 520h260v260H470Z" fill="#00000018"/>
  <rect x="500" y="560" width="200" height="170" rx="16" fill="#F7F2E8"/>
  <path d="M540 610h120M540 650h90" stroke="#1F3B2D" stroke-width="12" stroke-linecap="round"/>
  <path d="M500 480c0-40 30-70 50-90" stroke="#FFFFFF" stroke-width="16" stroke-linecap="round" opacity=".45"/>`;
}

/** A honey jar with a wooden dipper. */
function jar(color: string) {
  return `
  <rect x="400" y="330" width="400" height="80" rx="24" fill="#8C4A26"/>
  <path d="M420 410h360c30 0 50 20 50 50v390c0 50-40 80-90 80H460c-50 0-90-30-90-80V460c0-30 20-50 50-50Z" fill="${color}"/>
  <path d="M370 560c80 40 160-30 230 15s160 25 230-15v70H370Z" fill="#00000022"/>
  <rect x="470" y="640" width="260" height="160" rx="18" fill="#F7F2E8"/>
  <path d="M510 690h180M510 740h120" stroke="#8C4A26" stroke-width="14" stroke-linecap="round"/>
  <path d="M800 240 880 420" stroke="#A9603A" stroke-width="26" stroke-linecap="round"/>
  <ellipse cx="895" cy="455" rx="42" ry="56" fill="#A9603A" transform="rotate(-25 895 455)"/>`;
}

/** Deterministic pseudo-random numbers so images are stable between runs. */
function rng(seedValue: number) {
  let s = seedValue;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function productArt(opts: { kind: ArtKind; powder?: string; bg: string; seed: number }): string {
  const rand = rng(opts.seed);
  const powder = opts.powder ?? "#C98A3E";
  let inside = "";
  let around = "";

  const standing = opts.kind === "bottle" || opts.kind === "jar";
  if (standing) {
    inside = opts.kind === "jar" ? jar(powder) : bottle(powder);
  } else if (opts.kind === "powder" || opts.kind === "masala") {
    inside = `
      <ellipse cx="600" cy="610" rx="318" ry="96" fill="${powder}"/>
      <path d="M300 612C380 470 820 470 900 612C760 660 440 660 300 612Z" fill="${powder}"/>
      <path d="M380 560C470 500 720 498 820 556" stroke="#FFFFFF33" stroke-width="10" fill="none" stroke-linecap="round"/>
      ${Array.from({ length: 70 }, () => `<circle cx="${330 + rand() * 540}" cy="${520 + rand() * 150}" r="${1.5 + rand() * 2.5}" fill="#00000022"/>`).join("")}`;
    if (opts.kind === "masala") {
      inside += anise(560, 520, 1.2, 15) + cinnamon(640, 520, 0.9, 20) + cardamom(470, 560, 1.4, -10);
    }
  } else {
    const items: string[] = [];
    for (let i = 0; i < 90; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand());
      const x = 600 + Math.cos(a) * 290 * d;
      const y = 590 + Math.sin(a) * 82 * d - rand() * 50;
      const r = rand() * 180;
      if (opts.kind === "seeds") items.push(seed(x, y, r, powder));
      if (opts.kind === "pepper") items.push(peppercorn(x, y, 1.2 + rand() * 0.4));
      if (opts.kind === "cardamom" && i < 40) items.push(cardamom(x - 35, y - 10, 1.3, r));
      if (opts.kind === "anise" && i < 14) items.push(anise(x, y, 1.05, r));
      if (opts.kind === "cinnamon" && i < 12) items.push(cinnamon(x - 90, y - 20, 1.4, (rand() - 0.5) * 50));
      if (opts.kind === "bay" && i < 18) items.push(bay(x - 80, y - 30, 1.35, r));
      if (opts.kind === "chilli" && i < 16) items.push(chilli(x - 80, y - 30, 1.35, r));
      if (opts.kind === "dal") items.push(lentil(x, y, powder), lentil(x + 14, y + 6, powder));
      if (opts.kind === "rice") items.push(grain(x, y, r), grain(x + 12, y + 5, r + 40));
      if (opts.kind === "nuts" && i < 30) items.push(opts.powder === "cashew" ? cashew(x, y - 10, r) : almond(x, y - 10, r));
    }
    inside = `<ellipse cx="600" cy="610" rx="318" ry="96" fill="#00000014"/>${items.join("")}`;
  }

  around += anise(210, 300, 1.6, 20) + chilli(860, 860, 1.5, 160) + cardamom(220, 880, 1.8, -25) + bay(830, 230, 1.5, 30);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" width="1200" height="1200">
  <defs>
    <radialGradient id="bg" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#FFFDF8"/><stop offset="1" stop-color="${opts.bg}"/></radialGradient>
    <linearGradient id="bowl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6EFE3"/><stop offset="1" stop-color="#D9CDB8"/></linearGradient>
  </defs>
  <rect width="1200" height="1200" fill="url(#bg)"/>
  <ellipse cx="600" cy="1000" rx="420" ry="60" fill="#1F3B2D" opacity=".10"/>
  ${
    standing
      ? ""
      : `<path d="M220 610C240 860 400 990 600 990S960 860 980 610Z" fill="url(#bowl)"/>
  <ellipse cx="600" cy="610" rx="380" ry="118" fill="#FBF6EC"/>
  <ellipse cx="600" cy="612" rx="346" ry="102" fill="#E8DCC6"/>`
  }
  ${inside}
  ${around}
  <text x="600" y="1150" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="30" letter-spacing="6" fill="#1F3B2D" opacity=".45">SAMPLE IMAGE</text>
</svg>`;
}
