"use server";

import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { getDb } from "@/db";
import { errorEvents } from "@/db/schema";
import { requireStaffAction } from "@/data/session";
import { logAudit } from "@/server/audit";

/** Marks an error as fixed. It reopens (and alerts again) if it happens again. */
export async function resolveErrorAction(id: number) {
  const staff = await requireStaffAction("settings.manage");
  const db = getDb();
  await db.update(errorEvents).set({ resolvedAt: new Date() }).where(and(eq(errorEvents.id, id), isNull(errorEvents.resolvedAt)));
  await logAudit(db, { staffUserId: staff.id, action: "error.resolve", entityType: "error", entityId: id });
  refresh();
}
