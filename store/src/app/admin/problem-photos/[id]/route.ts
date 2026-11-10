import { getStaffSession, staffSignedIn } from "@/data/session";
import { getDb } from "@/db";
import { can } from "@/server/permissions";
import { problemPhoto } from "@/server/problems";

/** A customer's problem photo. Staff only (they can show a customer's home or parcel label). */
export async function GET(_req: Request, ctx: RouteContext<"/admin/problem-photos/[id]">) {
  const staff = await getStaffSession();
  if (!staffSignedIn(staff)) return new Response("Please sign in to the admin panel.", { status: 401 });
  if (!can(staff.role, "orders.manage")) return new Response("You don't have permission to see this.", { status: 403 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
  const data = await problemPhoto(getDb(), id);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
