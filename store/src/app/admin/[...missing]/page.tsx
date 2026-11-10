import { notFound } from "next/navigation";

/**
 * Any other address under /admin shows the admin's own "not found" page,
 * rendered per request so it carries this request's security nonce (the
 * site-wide not-found page is pre-rendered, so the admin policy would block it).
 */
export default function Missing() {
  notFound();
}
