"use server";

import { getDb } from "@/db";
import { clientIp } from "@/data/request";
import { enquirySchema } from "@/lib/form-schemas";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/validation";
import { createEnquiry } from "@/server/enquiries";
import { hitRateLimit } from "@/server/rate-limit";

export type EnquiryState = { ok: boolean; message: string; fieldErrors?: FieldErrors } | null;

export async function submitEnquiryAction(_prev: EnquiryState, formData: FormData): Promise<EnquiryState> {
  // Hidden field that people never fill in; bots usually do.
  if (String(formData.get("website") ?? "")) return { ok: true, message: "Thank you! We'll be in touch soon." };
  const parsed = enquirySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Please check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const db = getDb();
  if (!(await hitRateLimit(db, `enquiry:${await clientIp()}`, 5, 3600)).allowed) return { ok: false, message: "We've received several enquiries from you already. Please try again later or email us." };
  await createEnquiry(db, parsed.data);
  return { ok: true, message: "Thank you! We've received your enquiry and emailed you a copy. We'll be in touch soon." };
}
