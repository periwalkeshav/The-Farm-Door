"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";

/*
 * Chart tokens (validated with the dataviz palette checks against the admin
 * card surface #FFFDF8): one accent series in brand green; the comparison
 * period is drawn in de-emphasis gray (emphasis form, not a second category).
 */
const C = {
  surface: "#FFFDF8",
  accent: "#23774a",
  compare: "#b9b4a8",
  grid: "#ebe5d8",
  axis: "#d6cfbf",
  muted: "#8a8277",
  ink: "#27231f",
  inkSecondary: "#5d554d",
};

function compactRupees(paise: number) {
  const r = paise / 100;
  if (Math.abs(r) >= 1_00_00_000) return `₹${(r / 1_00_00_000).toFixed(1)}Cr`;
  if (Math.abs(r) >= 1_00_000) return `₹${(r / 1_00_000).toFixed(1)}L`;
  if (Math.abs(r) >= 1000) return `₹${(r / 1000).toFixed(r >= 10_000 ? 0 : 1)}K`;
  return `₹${Math.round(r)}`;
}

function fullRupees(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);
}

function bucketLabel(iso: string, unit: "day" | "week" | "month") {
  const d = new Date(`${iso}T00:00:00Z`);
  if (unit === "month") return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

export type TrendPoint = { bucket: string; value: number; compare?: number };

function TrendTooltip({ active, payload, unit, money, compareLabel }: TooltipContentProps<number, string> & { unit: "day" | "week" | "month"; money: boolean; compareLabel?: string }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as TrendPoint;
  const fmt = (v: number) => (money ? fullRupees(v) : v.toLocaleString("en-IN"));
  return (
    <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 text-[11px] text-[#8a8277]">{(unit === "week" ? "Week of " : "") + bucketLabel(point.bucket, unit)}</p>
      <p className="flex items-center gap-2">
        <span className="inline-block h-0.5 w-3 rounded" style={{ background: C.accent }} />
        <strong className="text-sm text-[#27231f]">{fmt(point.value)}</strong>
        <span className="text-[#5d554d]">this period</span>
      </p>
      {point.compare !== undefined && compareLabel && (
        <p className="mt-0.5 flex items-center gap-2">
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: C.compare }} />
          <strong className="text-[#27231f]">{fmt(point.compare)}</strong>
          <span className="text-[#5d554d]">{compareLabel}</span>
        </p>
      )}
    </div>
  );
}

/** Single-series trend (area wash + 2px line), optional gray comparison line, crosshair tooltip. */
export function TrendChart({ data, unit, money, compareLabel, height = 220 }: { data: TrendPoint[]; unit: "day" | "week" | "month"; money: boolean; compareLabel?: string; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} strokeWidth={1} />
          <XAxis
            dataKey="bucket"
            tickFormatter={(v: string) => bucketLabel(v, unit)}
            tick={{ fill: C.muted, fontSize: 11 }}
            axisLine={{ stroke: C.axis }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v: number) => (money ? compactRupees(v) : String(v))}
            tick={{ fill: C.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={56}
            allowDecimals={false}
          />
          <Tooltip cursor={{ stroke: C.axis, strokeWidth: 1 }} content={(p) => <TrendTooltip {...(p as TooltipContentProps<number, string>)} unit={unit} money={money} compareLabel={compareLabel} />} />
          {data.some((d) => d.compare !== undefined) && (
            <Line type="monotone" dataKey="compare" stroke={C.compare} strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />
          )}
          <Area
            type="monotone"
            dataKey="value"
            stroke={C.accent}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill={C.accent}
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 4, fill: C.accent, stroke: C.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Columns for counts over time (e.g. orders per day). Bars ≤24px, 4px rounded tops. */
export function ColumnChart({ data, unit, height = 180 }: { data: TrendPoint[]; unit: "day" | "week" | "month"; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={C.grid} strokeWidth={1} />
          <XAxis dataKey="bucket" tickFormatter={(v: string) => bucketLabel(v, unit)} tick={{ fill: C.muted, fontSize: 11 }} axisLine={{ stroke: C.axis }} tickLine={false} minTickGap={24} />
          <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={56} allowDecimals={false} />
          <Tooltip cursor={{ fill: "rgba(35,119,74,.06)" }} content={(p) => <TrendTooltip {...(p as TooltipContentProps<number, string>)} unit={unit} money={false} />} />
          <Bar dataKey="value" fill={C.accent} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
