import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui";
import { formatINR } from "@/lib/money";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-line bg-paper p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="font-sans text-base font-bold text-forest">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Stat tile: label, value, and a signed change vs the comparison period (up is good unless invert). */
export function StatTile({ label, value, previous, current, money = false, invert = false, hint }: { label: string; value: string; current?: number; previous?: number; money?: boolean; invert?: boolean; hint?: string }) {
  let delta: ReactNode = null;
  if (current !== undefined && previous !== undefined) {
    if (previous === 0) delta = current === 0 ? <span className="text-muted">No change</span> : <span className="text-muted">New this period</span>;
    else {
      const pct = ((current - previous) / Math.abs(previous)) * 100;
      const up = pct >= 0;
      const good = invert ? !up : up;
      delta = (
        <span className={good ? "text-[#1d6b2e]" : "text-chilli"}>
          <span aria-hidden="true">{up ? "▲" : "▼"}</span> {Math.abs(pct).toFixed(pct > -10 && pct < 10 ? 1 : 0)}%
          <span className="text-muted"> vs {money ? formatINR(previous) : previous.toLocaleString("en-IN")}</span>
        </span>
      );
    }
  }
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
      {delta && <p className="mt-1 text-xs">{delta}</p>}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "info" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap",
        tone === "neutral" && "bg-sand text-forest",
        tone === "good" && "bg-sage-soft text-[#1d6b2e]",
        tone === "warn" && "bg-[#fdf0d8] text-[#7a4a06]",
        tone === "bad" && "bg-chilli-soft text-[#8a2a16]",
        tone === "info" && "bg-[#e3ecf7] text-[#1c4f8a]",
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): "neutral" | "good" | "warn" | "bad" | "info" {
  if (["DELIVERED"].includes(status)) return "good";
  if (["CANCELLED", "RETURNED_TO_ORIGIN", "DELIVERY_FAILED"].includes(status)) return "bad";
  if (["AWAITING_PAYMENT", "AWAITING_COD_CONFIRMATION"].includes(status)) return "warn";
  if (["CONFIRMED"].includes(status)) return "info";
  return "neutral";
}

/** Horizontal bars (single hue): label and value as text, bar below. Values are always visible, never colour-only. */
export function BarTable({ rows, valueLabel, format }: { rows: { label: ReactNode; value: number; sub?: string }[]; valueLabel: string; format: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-muted">No data for this period.</p>;
  return (
    <ul className="space-y-3 text-sm" aria-label={valueLabel}>
      {rows.map((r, i) => (
        <li key={i}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate font-semibold text-ink">{r.label}</span>
            <span className="shrink-0 [font-variant-numeric:tabular-nums]">{format(r.value)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-2.5 flex-1">
              <div className="h-2.5 rounded-r-[4px] bg-[#23774a]" style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }} />
            </div>
            {r.sub && <span className="w-16 shrink-0 text-right text-xs text-muted">{r.sub}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DataTable({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-paper">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-bold tracking-wide text-muted uppercase">
            {head.map((h, i) => (
              <th key={i} className="px-4 py-3 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {empty && <p className="p-6 text-center text-sm text-muted">Nothing to show.</p>}
    </div>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-top", className)}>{children}</td>;
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-forest underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}
