"use server";

import { refresh } from "next/cache";
import { getDb } from "@/db";
import { requireStaffAction } from "@/data/session";
import { enquiryUpdateSchema } from "@/lib/form-schemas";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/validation";
import { updateEnquiry } from "@/server/enquiries";

export type EnquiryUpdateResult = { ok: boolean; message: string; fieldErrors?: FieldErrors } | null;

export async function updateEnquiryAction(id: number, _prev: EnquiryUpdateResult, formData: FormData): Promise<EnquiryUpdateResult> {
  const staff = await requireStaffAction("enquiries.manage");
  const parsed = enquiryUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const ok = await updateEnquiry(getDb(), id, parsed.data, staff.id);
  if (!ok) return { ok: false, message: "Enquiry not found." };
  refresh();
  return { ok: true, message: "Saved." };
}
