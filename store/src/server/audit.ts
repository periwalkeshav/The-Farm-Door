import type { DbOrTx } from "@/db";
import { auditLogs } from "@/db/schema";

export type AuditEntry = {
  staffUserId: number | null;
  action: string; // e.g. "order.refund", "product.update", "inventory.adjust"
  entityType: string;
  entityId?: string | number;
  data?: Record<string, unknown>;
  ip?: string;
};

/** Records an important admin action. Call inside the same transaction as the change. */
export async function logAudit(db: DbOrTx, entry: AuditEntry) {
  await db.insert(auditLogs).values({
    staffUserId: entry.staffUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId === undefined ? "" : String(entry.entityId),
    data: entry.data ?? {},
    ip: entry.ip ?? "",
  });
}
