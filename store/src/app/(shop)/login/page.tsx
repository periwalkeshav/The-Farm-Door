import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/shop/login-form";
import { Container, Skeleton } from "@/components/ui";
import { getCustomer } from "@/data/session";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Container className="max-w-md py-14">
      <h1 className="mb-2 text-4xl">Sign in</h1>
      <p className="mb-8 text-muted">See your orders, track deliveries and check out faster.</p>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function LoginContent({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/account";
  if (await getCustomer()) redirect(next);
  const error = sp.error === "google" ? "Google sign-in didn't complete. Please try again or use an email code." : null;
  return (
    <>
      {error && <p className="mb-4 text-sm font-semibold text-chilli">{error}</p>}
      <LoginForm next={next} googleEnabled={!!env().GOOGLE_CLIENT_ID} />
    </>
  );
}
