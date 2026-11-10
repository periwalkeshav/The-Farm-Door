import { getGoogleFeed } from "@/data/catalog";

/** Product feed for Google Merchant Center. Add this URL as a scheduled fetch there. */
export async function GET() {
  const feed = await getGoogleFeed();
  return new Response(feed.body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
