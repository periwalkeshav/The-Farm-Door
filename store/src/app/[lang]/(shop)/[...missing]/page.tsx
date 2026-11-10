import { notFound } from "next/navigation";

/** Any other address under the shop shows the shop's "not found" page, with the header and footer. */
export default function Missing() {
  notFound();
}
