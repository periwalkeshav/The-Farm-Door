/**
 * Decorative spice illustrations (inline SVG, no image downloads), drawn in
 * the same style as the sample product art. All are hidden from screen readers.
 */
import type { SVGProps } from "react";

type ArtProps = Omit<SVGProps<SVGSVGElement>, "viewBox">;

const svg = (viewBox: string, children: React.ReactNode, { className, ...props }: ArtProps) => (
  <svg viewBox={viewBox} className={className} aria-hidden="true" focusable="false" {...props}>
    {children}
  </svg>
);

export function StarAnise(props: ArtProps) {
  return svg(
    "-50 -50 100 100",
    <>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <path d="M0-6C9-14 11-30 0-47C-11-30-9-14 0-6Z" fill="#8C4A26" />
          <path d="M-5.5-15C-7-25-4-36 0-44" stroke="#B06A3C" strokeWidth="1.4" fill="none" />
          <ellipse cx="0" cy="-27" rx="3.4" ry="6.4" fill="#E0AC6C" stroke="#5E2F17" strokeWidth=".9" />
        </g>
      ))}
      <circle r="7.5" fill="#6B3519" />
    </>,
    props,
  );
}

export function Chilli(props: ArtProps) {
  return svg(
    "0 4 160 56",
    <>
      <path d="M30 22C60 10 110 12 152 52C150 54 147 55 144 54C110 36 70 38 34 44C24 44 20 26 30 22Z" fill="#C23B26" />
      <path d="M44 24C74 17 106 20 132 36" stroke="#E5684D" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M34 20C24 18 18 26 20 33C18 41 26 47 35 44C30 38 29 27 34 20Z" fill="#4E7A3A" />
      <path d="M21 32C12 31 7 25 6 16" stroke="#4E7A3A" strokeWidth="4" strokeLinecap="round" fill="none" />
    </>,
    props,
  );
}

export function Cinnamon(props: ArtProps) {
  return svg(
    "12 12 148 30",
    <>
      <rect x="20" y="16" width="136" height="22" rx="11" fill="#A9603A" />
      <path d="M32 22H146" stroke="#8B4A2A" strokeWidth="1.6" />
      <path d="M36 31H140" stroke="#C27D50" strokeWidth="1.6" />
      <ellipse cx="22" cy="27" rx="7" ry="11" fill="#CB8A5C" />
      <path d="M22 19.5c4 .5 4.5 14.5 0 15-3.5-.5-3.5-11 0-11 2 .5 2 7 0 7" fill="none" stroke="#7A3F21" strokeWidth="1.5" />
    </>,
    props,
  );
}

export function Cardamom(props: ArtProps) {
  return svg(
    "2 2 74 34",
    <>
      <path d="M6 18C16 6 46 4 66 16C68 18 68 19 66 20C46 32 16 30 6 18Z" fill="#9BB766" />
      <path d="M12 18C28 12 48 12 62 17M12 18C28 24 48 24 62 19" stroke="#6F8B40" strokeWidth="1.3" fill="none" />
      <path d="M66 18h6" stroke="#6F8B40" strokeWidth="2.2" strokeLinecap="round" />
    </>,
    props,
  );
}

export function BayLeaf(props: ArtProps) {
  return svg(
    "10 0 140 58",
    <>
      <path d="M14 30C42 6 100 2 144 28C100 52 42 54 14 30Z" fill="#7F9C5B" />
      <path d="M18 30C58 27 100 26 140 28" stroke="#5C7A3C" strokeWidth="1.6" fill="none" />
      <path d="M46 29 58 17M66 28l12-13M86 27l12-11M46 30l12 11M66 29l12 13M86 28l12 12" stroke="#6C8A4A" strokeWidth="1.2" />
    </>,
    props,
  );
}

export function Peppercorns(props: ArtProps) {
  const dots: [number, number][] = [
    [12, 14],
    [30, 10],
    [22, 28],
    [42, 24],
    [8, 34],
  ];
  return svg(
    "0 0 54 44",
    dots.map(([x, y]) => (
      <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
        <circle r="7.5" fill="#2E2520" />
        <circle cx="-2.4" cy="-2.4" r="2.2" fill="#6E5C4D" />
      </g>
    )),
    props,
  );
}

export function Clove(props: ArtProps) {
  return svg(
    "0 0 30 70",
    <>
      <path d="M15 22 L15 66" stroke="#5B2E1A" strokeWidth="5" strokeLinecap="round" />
      <path d="M15 24C8 22 5 16 7 10M15 24C22 22 25 16 23 10M15 24C13 16 13 8 15 4M15 24C17 16 17 8 15 4" fill="#7A3B21" stroke="#5B2E1A" strokeWidth="1.2" />
      <circle cx="15" cy="12" r="5" fill="#8E4A2A" />
    </>,
    props,
  );
}

/** A small mound of ground spice (turmeric by default). */
export function SpiceMound({ color = "#E3A33B", shade = "#C9852A", ...props }: ArtProps & { color?: string; shade?: string }) {
  return svg(
    "0 0 120 56",
    <>
      <ellipse cx="60" cy="50" rx="56" ry="6" fill="#00000014" />
      <path d="M6 50C18 30 38 10 60 8C82 10 102 30 114 50Z" fill={color} />
      <path d="M60 8C70 18 74 34 70 50H114C102 30 82 10 60 8Z" fill={shade} opacity=".55" />
      {[
        [30, 40],
        [48, 26],
        [70, 30],
        [88, 42],
        [56, 42],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="#ffffff" opacity=".35" />
      ))}
    </>,
    props,
  );
}

/** A mortar and pestle, for masala blends. */
export function MortarPestle(props: ArtProps) {
  return svg(
    "0 0 120 110",
    <>
      <rect x="62" y="6" width="16" height="70" rx="8" transform="rotate(28 70 41)" fill="#B8A48A" />
      <rect x="62" y="6" width="6" height="70" rx="3" transform="rotate(28 70 41)" fill="#CFBDA3" />
      <path d="M10 52H110C110 82 88 100 60 100S10 82 10 52Z" fill="#8F7B63" />
      <path d="M10 52H110C110 60 108 66 104 72H16C12 66 10 60 10 52Z" fill="#A38E74" />
      <ellipse cx="60" cy="52" rx="50" ry="10" fill="#6E5C4A" />
      <ellipse cx="60" cy="50" rx="40" ry="6" fill="#C2662E" />
      <ellipse cx="48" cy="49" rx="12" ry="3" fill="#E3A33B" />
      <rect x="42" y="98" width="36" height="8" rx="4" fill="#6E5C4A" />
    </>,
    props,
  );
}

/** A kraft-paper parcel tied with string. */
export function Parcel(props: ArtProps) {
  return svg(
    "0 0 120 100",
    <>
      <path d="M10 34 60 12l50 22v46L60 98 10 80Z" fill="#D9B98C" />
      <path d="M60 56v42L10 80V34Z" fill="#C9A574" />
      <path d="M10 34 60 56l50-22" fill="none" stroke="#B48C5A" strokeWidth="2" />
      <path d="M35 23l50 22v18" fill="none" stroke="#1F3B2D" strokeWidth="4" strokeLinejoin="round" />
      <path d="M60 56v42" stroke="#B48C5A" strokeWidth="2" />
      <circle cx="78" cy="40" r="7" fill="none" stroke="#1F3B2D" strokeWidth="3" />
    </>,
    props,
  );
}

/** A delivery van. */
export function Van(props: ArtProps) {
  return svg(
    "0 0 150 90",
    <>
      <rect x="6" y="20" width="88" height="50" rx="6" fill="#1F3B2D" />
      <path d="M94 34h28l18 18v18H94Z" fill="#2B4E3A" />
      <path d="M100 40h20l12 12h-32Z" fill="#E5ECDC" />
      <rect x="16" y="32" width="60" height="6" rx="3" fill="#E3A33B" />
      <rect x="16" y="44" width="40" height="5" rx="2.5" fill="#F7F2E8" opacity=".7" />
      <circle cx="34" cy="72" r="11" fill="#27231F" />
      <circle cx="34" cy="72" r="4.5" fill="#DDD3C1" />
      <circle cx="116" cy="72" r="11" fill="#27231F" />
      <circle cx="116" cy="72" r="4.5" fill="#DDD3C1" />
    </>,
    props,
  );
}

/** Sacks of whole spices, for bulk orders. */
export function SpiceSacks(props: ArtProps) {
  return svg(
    "0 0 160 110",
    <>
      <path d="M78 30c-4-10 2-16 14-16h22c12 0 18 6 14 16l8 60c2 12-6 18-18 18H88c-12 0-20-6-18-18Z" fill="#CDB38A" />
      <ellipse cx="103" cy="28" rx="26" ry="8" fill="#8C4A26" />
      <circle cx="96" cy="26" r="2.5" fill="#E0AC6C" />
      <circle cx="108" cy="28" r="2.5" fill="#E0AC6C" />
      <path d="M22 44c-4-10 2-16 14-16h22c12 0 18 6 14 16l8 50c2 10-6 14-18 14H32c-12 0-20-4-18-14Z" fill="#D9C29C" />
      <ellipse cx="47" cy="42" rx="26" ry="8" fill="#E3A33B" />
      <path d="M30 74h36M34 84h28" stroke="#B89A6C" strokeWidth="2" strokeLinecap="round" />
    </>,
    props,
  );
}

/** A cooking pot with steam, for recipes. */
export function Pot(props: ArtProps) {
  return svg(
    "0 0 140 110",
    <>
      <path className="steam" d="M50 30c-8-8 8-12 0-22M70 26c-8-8 8-12 0-22M90 30c-8-8 8-12 0-22" fill="none" stroke="#C9BBA6" strokeWidth="3.5" strokeLinecap="round" />
      <rect x="14" y="44" width="112" height="10" rx="5" fill="#2B4E3A" />
      <path d="M20 52h100v26c0 16-12 26-28 26H48c-16 0-28-10-28-26Z" fill="#1F3B2D" />
      <rect x="2" y="60" width="20" height="8" rx="4" fill="#1F3B2D" />
      <rect x="118" y="60" width="20" height="8" rx="4" fill="#1F3B2D" />
      <path d="M34 66h72" stroke="#E3A33B" strokeWidth="4" strokeLinecap="round" opacity=".8" />
    </>,
    props,
  );
}

/** A bottle of golden oil, for the oils category. */
export function OilBottle(props: ArtProps) {
  return svg(
    "0 0 60 110",
    <>
      <rect x="23" y="2" width="14" height="9" rx="2" fill="#1F3B2D" />
      <path d="M25 11h10v12c0 3 9 7 9 16v58c0 5-4 9-9 9H25c-5 0-9-4-9-9V39c0-9 9-13 9-16Z" fill="#E9C46A" />
      <path d="M16 52h28v34H16Z" fill="#D9A93E" />
      <rect x="20" y="58" width="20" height="20" rx="3" fill="#F7F2E8" />
      <path d="M24 64h12M24 69h9" stroke="#1F3B2D" strokeWidth="2" strokeLinecap="round" />
      <path d="M21 40c0-4 3-7 5-9" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" opacity=".55" />
    </>,
    props,
  );
}

/** A jar of honey with a dipper, for the honey category. */
export function HoneyJar(props: ArtProps) {
  return svg(
    "0 0 100 100",
    <>
      <rect x="20" y="14" width="50" height="12" rx="4" fill="#8C4A26" />
      <path d="M22 26h46c4 0 6 3 6 6v50c0 7-5 12-12 12H28c-7 0-12-5-12-12V32c0-3 2-6 6-6Z" fill="#E3A33B" />
      <path d="M16 46c10 5 20-4 29 2s20 3 29-2v8H16Z" fill="#C9852A" />
      <rect x="28" y="56" width="34" height="22" rx="4" fill="#F7F2E8" />
      <path d="M33 63h24M33 70h16" stroke="#8C4A26" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M74 6 86 30" stroke="#A9603A" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="88" cy="34" rx="6" ry="8" fill="#A9603A" transform="rotate(-25 88 34)" />
    </>,
    props,
  );
}

/** Two ears of wheat, for grains. */
export function Wheat(props: ArtProps) {
  const ear = (x: number, tilt: number) => (
    <g transform={`translate(${x} 0) rotate(${tilt} 20 100)`}>
      <path d="M20 100V30" stroke="#B98B3E" strokeWidth="3" strokeLinecap="round" />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <ellipse cx="13" cy={36 + i * 11} rx="5" ry="9" fill="#E0B25A" transform={`rotate(-30 13 ${36 + i * 11})`} />
          <ellipse cx="27" cy={36 + i * 11} rx="5" ry="9" fill="#D7A44A" transform={`rotate(30 27 ${36 + i * 11})`} />
        </g>
      ))}
      <ellipse cx="20" cy="26" rx="5" ry="9" fill="#E0B25A" />
    </g>
  );
  return svg(
    "0 0 80 104",
    <>
      {ear(10, -10)}
      {ear(30, 12)}
    </>,
    props,
  );
}

/** A little heap of lentils (dal), for pulses. */
export function Lentils(props: ArtProps) {
  const dots: [number, number][] = [];
  for (let row = 0; row < 5; row++) for (let i = 0; i <= row * 2; i++) dots.push([60 - row * 9 + i * 9, 12 + row * 9]);
  return svg(
    "0 0 120 64",
    <>
      <ellipse cx="60" cy="58" rx="56" ry="6" fill="#00000014" />
      {dots.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="5.6" fill={i % 3 === 0 ? "#D9822B" : "#E89A3C"} />
          <circle cx={x - 1.6} cy={y - 1.6} r="1.6" fill="#FFFFFF" opacity=".35" />
        </g>
      ))}
    </>,
    props,
  );
}

/** Almonds and a cashew, for dry fruits. */
export function Nuts(props: ArtProps) {
  const almond = (x: number, y: number, r: number) => (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <path d="M0-16C9-10 10 8 0 16C-10 8-9-10 0-16Z" fill="#B0683A" />
      <path d="M-2-10C-5-2-4 6-1 11" stroke="#8C4A26" strokeWidth="1.4" fill="none" />
    </g>
  );
  return svg(
    "0 0 90 60",
    <>
      {almond(22, 30, -30)}
      {almond(46, 24, 15)}
      <path d="M58 40c-2-14 8-26 20-24 4 1 4 6 0 7-7 1-11 8-10 16 0 4-9 6-10 1Z" fill="#EBD3A2" />
      {almond(36, 44, 70)}
    </>,
    props,
  );
}
