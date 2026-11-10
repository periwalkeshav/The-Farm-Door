import { getSearchSuggestions } from "@/data/catalog";
import { normalizeSearch } from "@/lib/search";

/** Suggestions for the search boxes, as the customer types. Public catalogue data only. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = normalizeSearch(params.get("q") ?? "").slice(0, 60);
  const lang = params.get("lang") === "hi" ? "hi" : "en";
  const body = q.length < 2 ? { products: [], categories: [], didYouMean: null } : await getSearchSuggestions(q, lang);
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=60" } });
}
