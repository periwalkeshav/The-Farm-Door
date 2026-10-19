import Link from "next/link";

export const metadata = { title: "No access" };

export default function NoAccessPage() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="font-display text-3xl">You don&apos;t have access to that page</h1>
      <p className="mt-2 text-muted">Ask the store owner if you need it.</p>
      <Link href="/admin/orders" className="mt-6 inline-block font-semibold text-forest underline">
        Go to orders
      </Link>
    </div>
  );
}
