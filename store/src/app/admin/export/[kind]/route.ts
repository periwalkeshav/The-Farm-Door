import { getStaffSession, staffSignedIn } from "@/data/session";
import { getDb } from "@/db";
import { resolveRange } from "@/server/date-ranges";
import { EXPORTS, toCsv } from "@/server/exports";
import { logAudit } from "@/server/audit";
import { can } from "@/server/permissions";

/** CSV download. Requires a fully signed-in staff member with the export and data permissions. */
export async function GET(request: Request, ctx: RouteContext<"/admin/export/[kind]">) {
  const { kind } = await ctx.params;
  const spec = EXPORTS[kind];
  if (!spec) return new Response("Unknown export", { status: 404 });
  const staff = await getStaffSession();
  if (!staffSignedIn(staff)) return new Response("Please sign in to the admin panel.", { status: 401 });
  if ((spec.requiresExportPermission !== false && !can(staff.role, "exports")) || !can(staff.role, spec.permission)) return new Response("You don't have permission to download this.", { status: 403 });

  const params = new URL(request.url).searchParams;
  const sp: Record<string, string> = Object.fromEntries(params);
  // The orders list filters by placed date with from/to; treat that as a custom range.
  if (!sp.range && (sp.from || sp.to)) sp.range = "custom";
  if (sp.range === "custom") {
    sp.from ||= "2020-01-01";
    sp.to ||= new Date().toISOString().slice(0, 10);
  }
  const range = resolveRange(spec.dated ? (sp.range ? sp : { range: "fytd" }) : {});
  const label = `${range.fromDate}_to_${range.toDate}`;
  const db = getDb();
  const csv = await spec.build(db, { range: range.range, label, params });
  await logAudit(db, { staffUserId: staff.id, action: "export.download", entityType: "export", entityId: kind, data: { rows: csv.rows.length, range: label } });
  return new Response(toCsv(csv), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csv.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
