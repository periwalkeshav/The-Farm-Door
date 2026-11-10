"use server";

import { refresh, revalidateTag } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { PermissionError, requireStaffAction } from "@/data/session";
import { problemCloseSchema, problemReplacementSchema, refundFormSchema } from "@/lib/form-schemas";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/validation";
import { closeProblem, ProblemError, refundForProblem, sendReplacement, setProblemStaffNote } from "@/server/problems";

export type ProblemAdminResult = { ok: boolean; message: string; fieldErrors?: FieldErrors } | null;

const invalid = (error: z.ZodError): ProblemAdminResult => ({ ok: false, message: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(error) });

async function run(fn: () => Promise<string>): Promise<ProblemAdminResult> {
  try {
    const message = await fn();
    revalidateTag("stock", "max");
    refresh();
    return { ok: true, message };
  } catch (err) {
    if (err instanceof ProblemError || err instanceof PermissionError) return { ok: false, message: err.message };
    console.error("[admin] problem action failed:", err);
    return { ok: false, message: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function sendReplacementAction(reportId: number, _prev: ProblemAdminResult, formData: FormData): Promise<ProblemAdminResult> {
  const staff = await requireStaffAction("orders.manage");
  const parsed = problemReplacementSchema.safeParse({ note: formData.get("note") });
  if (!parsed.success) return invalid(parsed.error);
  const lines = [...formData.entries()]
    .filter(([k]) => k.startsWith("qty-"))
    .map(([k, v]) => ({ orderItemId: Number(k.slice(4)), quantity: Number(v) }))
    .filter((l) => Number.isInteger(l.orderItemId) && Number.isInteger(l.quantity) && l.quantity >= 0);
  return run(async () => {
    const order = await sendReplacement(getDb(), reportId, lines, parsed.data.note, staff.id);
    return `Replacement order ${order.orderNumber} created. Pack it from Orders like any other order.`;
  });
}

export async function refundProblemAction(reportId: number, maxPaise: number, _prev: ProblemAdminResult, formData: FormData): Promise<ProblemAdminResult> {
  const staff = await requireStaffAction("orders.refund");
  const parsed = refundFormSchema(maxPaise).safeParse({ amount: formData.get("amount"), mode: formData.get("mode"), reason: formData.get("reason"), reference: formData.get("reference") });
  if (!parsed.success) return invalid(parsed.error);
  return run(async () => {
    await refundForProblem(getDb(), reportId, { amountPaise: parsed.data.amount, mode: parsed.data.mode, reference: parsed.data.reference, reason: parsed.data.reason }, staff.id);
    return "Refunded. The customer has been emailed.";
  });
}

export async function closeProblemAction(reportId: number, _prev: ProblemAdminResult, formData: FormData): Promise<ProblemAdminResult> {
  const staff = await requireStaffAction("orders.manage");
  const parsed = problemCloseSchema.safeParse({ note: formData.get("note") });
  if (!parsed.success) return invalid(parsed.error);
  return run(async () => {
    await closeProblem(getDb(), reportId, parsed.data.note, staff.id);
    return "Closed. The customer has been emailed your message.";
  });
}

export async function problemNoteAction(reportId: number, note: string): Promise<ProblemAdminResult> {
  await requireStaffAction("orders.manage");
  return run(async () => {
    await setProblemStaffNote(getDb(), reportId, z.string().max(2000).catch("").parse(note));
    return "Note saved.";
  });
}
