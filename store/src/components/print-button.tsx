"use client";

export function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-full bg-[#1F3B2D] px-5 py-2 text-sm font-semibold text-white">
      {label}
    </button>
  );
}
