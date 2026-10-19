import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { emailLog } from "@/db/schema";

export const metadata = { title: "Email" };

export default function EmailPage({ params }: PageProps<"/admin/emails/[id]">) {
  return (
    <Suspense fallback={null}>
      <Email params={params} />
    </Suspense>
  );
}

async function Email({ params }: { params: PageProps<"/admin/emails/[id]">["params"] }) {
  await requireStaff("settings.manage");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [e] = await getDb().select().from(emailLog).where(eq(emailLog.id, id));
  if (!e) notFound();
  return (
    <>
      <Link href="/admin/emails" className="text-sm text-muted hover:underline">
        ← Email log
      </Link>
      <PageHeader title={e.subject} description={`To ${e.to} · ${e.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`} />
      {e.html ? (
        // Sandboxed with no permissions: scripts and links inside can't run against the admin.
        <iframe title="Email preview" srcDoc={e.html} sandbox="" className="h-[75vh] w-full rounded-2xl border border-line bg-white" />
      ) : (
        <p className="text-sm text-muted">The content of sent emails isn&apos;t stored.</p>
      )}
    </>
  );
}
