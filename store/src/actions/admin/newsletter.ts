"use server";

import { refresh } from "next/cache";
import { getDb } from "@/db";
import { requireStaffAction } from "@/data/session";
import { logAudit } from "@/server/audit";
import { COMING_SOON_SOURCE, emailsFromCsv, importSubscribers } from "@/server/newsletter";

export type ImportResult = { ok: boolean; message: string } | null;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export async function importComingSoonListAction(_prev: ImportResult, formData: FormData): Promise<ImportResult> {
  const staff = await requireStaffAction("settings.manage");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose the CSV file to import." };
  if (file.size > 2_000_000) return { ok: false, message: "That file is too large (2 MB maximum)." };
  const { valid, invalid } = emailsFromCsv(await file.text());
  if (valid.length === 0) return { ok: false, message: "No email addresses were found in that file. Is it the CSV download from Netlify Forms?" };
  const db = getDb();
  const r = await importSubscribers(db, valid, COMING_SOON_SOURCE);
  await logAudit(db, { staffUserId: staff.id, action: "newsletter.import", entityType: "newsletter", entityId: "coming-soon", data: { added: r.added, skipped: r.skipped, invalid } });
  refresh();
  const parts = [`Added ${plural(r.added, "new address")}.`];
  if (r.skipped) parts.push(`${plural(r.skipped, "address")} were already on the list or had opted out.`);
  if (invalid) parts.push(`${plural(invalid, "row")} had no valid email.`);
  return { ok: true, message: parts.join(" ") };
}
