import { Suspense } from "react";
import { CheckoutSettingsForm, CodSettingsForm, NotificationSettingsForm, ShippingSettingsForm, StoreSettingsForm } from "@/components/admin/settings-forms";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { env } from "@/lib/env";
import { readAllSettings } from "@/server/settings";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading settings…</p>}>
      <Settings />
    </Suspense>
  );
}

function Integration({ name, status, tone, detail }: { name: string; status: string; tone: "good" | "warn" | "bad"; detail: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line py-3 last:border-0">
      <div>
        <p className="font-semibold text-ink">{name}</p>
        <p className="text-xs text-muted">{detail}</p>
      </div>
      <Badge tone={tone}>{status}</Badge>
    </div>
  );
}

async function Settings() {
  await requireStaff("settings.manage");
  const s = await readAllSettings(getDb());
  const e = env();
  const base = e.APP_URL;
  const razorpay =
    e.PAYMENTS_PROVIDER === "mock"
      ? { status: "Simulated", tone: "warn" as const }
      : !e.RAZORPAY_KEY_ID || !e.RAZORPAY_KEY_SECRET
        ? { status: "Keys missing", tone: "bad" as const }
        : e.RAZORPAY_KEY_ID.startsWith("rzp_test_")
          ? { status: "Test mode", tone: "warn" as const }
          : { status: "Live", tone: "good" as const };
  const courier =
    e.SHIPPING_PROVIDER === "mock"
      ? { status: "Simulated", tone: "warn" as const }
      : e.SHIPROCKET_EMAIL && e.SHIPROCKET_PASSWORD && e.SHIPROCKET_PICKUP_LOCATION
        ? { status: "Connected", tone: "good" as const }
        : { status: "Not configured", tone: "bad" as const };
  return (
    <>
      <PageHeader title="Settings" description="Changes apply immediately to the shop. API keys and secrets aren't stored here; they're set as environment variables on the server." />
      <div className="space-y-6">
        <Panel title="Connections">
          <Integration name="Razorpay payments" {...razorpay} detail={`Webhook URL: ${base}/api/webhooks/razorpay · events: payment.captured, payment.failed, order.paid, refund.processed, refund.failed${e.RAZORPAY_WEBHOOK_SECRET ? "" : " · webhook secret NOT set"}`} />
          <Integration name="Shiprocket courier" {...courier} detail={`Tracking webhook URL: ${base}/api/webhooks/courier-updates${e.SHIPROCKET_WEBHOOK_TOKEN ? "" : " · security token NOT set"}`} />
          <Integration
            name="Email"
            status={e.EMAIL_TRANSPORT === "log" ? "Logged only" : "Sending"}
            tone={e.EMAIL_TRANSPORT === "log" ? "warn" : "good"}
            detail={e.EMAIL_TRANSPORT === "log" ? "Emails are kept in the Email log, not delivered." : `From ${e.EMAIL_FROM}`}
          />
          <Integration name="Sign in with Google" status={e.GOOGLE_CLIENT_ID ? "On" : "Off"} tone={e.GOOGLE_CLIENT_ID ? "good" : "warn"} detail="Optional. Customers can always sign in with an email code." />
          <Integration name="Scheduled jobs" status="Needs a scheduler" tone="warn" detail={`Call ${base}/api/cron/tick every 5 minutes with header "Authorization: Bearer <CRON_SECRET>". It expires unpaid orders, syncs tracking and sends alerts.`} />
        </Panel>
        <Panel title="Business details">
          <StoreSettingsForm s={s.store} />
        </Panel>
        <Panel title="Shipping">
          <ShippingSettingsForm s={s.shipping} />
        </Panel>
        <Panel title="Cash on delivery">
          <CodSettingsForm s={s.cod} />
        </Panel>
        <Panel title="Checkout">
          <CheckoutSettingsForm s={s.checkout} />
        </Panel>
        <Panel title="Store alerts">
          <NotificationSettingsForm s={s.notifications} />
        </Panel>
      </div>
    </>
  );
}
