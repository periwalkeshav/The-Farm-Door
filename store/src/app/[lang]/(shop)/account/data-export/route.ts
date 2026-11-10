import { getCustomer } from "@/data/session";
import { getDb } from "@/db";
import { customerDataExport } from "@/server/data-export";
import { hitRateLimit } from "@/server/rate-limit";

/** "Download my data": a JSON file of everything held about the signed-in customer. */
export async function GET() {
  const customer = await getCustomer();
  if (!customer) return new Response("Please sign in to download your data.", { status: 401 });
  const db = getDb();
  if (!(await hitRateLimit(db, `data-export:${customer.id}`, 5, 3600)).allowed) return new Response("You've downloaded your data several times in the last hour. Please try again later.", { status: 429 });
  const data = await customerDataExport(db, customer.id);
  if (!data) return new Response("Account not found.", { status: 404 });
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="the-farm-door-my-data-${date}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
