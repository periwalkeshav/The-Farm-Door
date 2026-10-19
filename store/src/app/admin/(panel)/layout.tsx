import Link from "next/link";
import { Suspense } from "react";
import { staffSignOutAction } from "@/actions/admin/auth";
import { Logo } from "@/components/ui";
import { requireStaff } from "@/data/session";
import { testModeReasons } from "@/lib/env";
import { can, ROLE_LABELS, type Permission } from "@/server/permissions";

// Every admin page depends on the signed-in staff member, so navigations wait for the server.
export const instant = false;

const NAV: { href: string; label: string; permission: Permission }[] = [
  { href: "/admin", label: "Dashboard", permission: "dashboard.view" },
  { href: "/admin/orders", label: "Orders", permission: "orders.view" },
  { href: "/admin/products", label: "Products", permission: "products.manage" },
  { href: "/admin/catalog", label: "Categories & collections", permission: "products.manage" },
  { href: "/admin/inventory", label: "Inventory", permission: "inventory.view" },
  { href: "/admin/customers", label: "Customers", permission: "customers.view" },
  { href: "/admin/coupons", label: "Coupons", permission: "coupons.manage" },
  { href: "/admin/reviews", label: "Reviews", permission: "reviews.manage" },
  { href: "/admin/reports", label: "Reports & exports", permission: "reports.operations" },
  { href: "/admin/settings", label: "Settings", permission: "settings.manage" },
  { href: "/admin/staff", label: "Staff", permission: "staff.manage" },
  { href: "/admin/emails", label: "Email log", permission: "settings.manage" },
  { href: "/admin/audit", label: "Audit log", permission: "audit.view" },
];

export default function PanelLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-muted">Loading admin…</div>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const nav = NAV.filter((n) => can(staff.role, n.permission));
  const test = testModeReasons();
  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-forest text-ivory lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 p-4 lg:block">
          <Link href="/admin" className="block [&_*]:text-ivory">
            <Logo />
          </Link>
          <p className="text-xs text-ivory/60 lg:mt-1">Admin</p>
        </div>
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-0.5 lg:overflow-visible">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="block shrink-0 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap text-ivory/80 hover:bg-ivory/10 hover:text-ivory">
              {n.label}
            </Link>
          ))}
          <Link href="/" className="block shrink-0 rounded-lg px-3 py-2 text-sm whitespace-nowrap text-ivory/60 hover:text-ivory" target="_blank">
            View shop ↗
          </Link>
        </nav>
        <div className="hidden border-t border-ivory/10 p-4 text-sm lg:block">
          <p className="font-semibold">{staff.name}</p>
          <p className="text-xs text-ivory/60">{ROLE_LABELS[staff.role]}</p>
          <Link href="/admin/account" className="mt-2 block text-xs font-semibold text-ivory/80 hover:underline">
            My account
          </Link>
          <form action={staffSignOutAction} className="mt-2">
            <button type="submit" className="text-xs font-semibold text-saffron hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0">
        {test.length > 0 && <div className="bg-chilli px-4 py-1.5 text-center text-xs font-semibold text-white">TEST MODE: {test.join(", ")}.</div>}
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</main>
        <form action={staffSignOutAction} className="px-4 pb-6 lg:hidden">
          <button type="submit" className="text-sm font-semibold text-chilli">
            Sign out ({staff.name})
          </button>
        </form>
      </div>
    </div>
  );
}
