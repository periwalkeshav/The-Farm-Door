import type { Metadata } from "next";
import { headers } from "next/headers";
import { RootHtml } from "@/components/root-html";

export { viewport } from "@/components/root-html";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · The Farm Door" }, robots: { index: false, follow: false } };

// Rendered for each request: the page carries that request's security nonce (src/proxy.ts).
export const instant = false;

/** Root layout for the admin panel (English only). */
export default async function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <RootHtml lang="en-IN" nonce={nonce}>
      <div className="min-h-dvh bg-[#F3EFE6]">{children}</div>
    </RootHtml>
  );
}
