"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { lookupPincodeAction, placeOrderAction, previewCheckoutAction } from "@/actions/checkout";
import { Notice, cn } from "@/components/ui";
import { INDIAN_STATES } from "@/lib/india";
import { formatINR } from "@/lib/money";
import type { CheckoutView } from "@/server/checkout-view";
import { Totals } from "./order-summary";
import { openRazorpay, SimulatedPaymentDialog, type LaunchInput } from "./payment-launcher";

export type SavedAddress = { id: number; name: string; phone: string; line1: string; line2: string; landmark: string; city: string; state: string; pincode: string };

const TEXT_FIELDS = ["email", "phone", "name", "line1", "line2", "landmark", "city", "state", "pincode", "gstin", "businessName", "note"] as const;

export function CheckoutForm(props: { initialView: CheckoutView; customer: { email: string; name: string; phone: string } | null; addresses: SavedAddress[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const first = props.addresses[0];
  // Inputs are uncontrolled so anything typed before the page finishes loading is kept.
  const defaults = {
    email: props.customer?.email ?? "",
    phone: first?.phone ?? props.customer?.phone ?? "",
    name: first?.name ?? props.customer?.name ?? "",
    line1: first?.line1 ?? "",
    line2: first?.line2 ?? "",
    landmark: first?.landmark ?? "",
    city: first?.city ?? "",
    state: first?.state ?? "",
    pincode: first?.pincode ?? props.initialView.pincode ?? "",
  };
  const [pincode, setPincode] = useState(defaults.pincode);
  const [paymentMethod, setPaymentMethod] = useState<"PREPAID" | "COD">("PREPAID");
  const [view, setView] = useState(props.initialView);
  const [business, setBusiness] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [placing, setPlacing] = useState(false);
  const [simulated, setSimulated] = useState<LaunchInput | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const lastPreview = useRef("");

  const field = (name: string) => formRef.current?.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;

  // Pick up a pincode typed before the page became interactive.
  useEffect(() => {
    const typed = field("pincode")?.value ?? "";
    // Syncing from the DOM (an external source) once after hydration is the intended use here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (typed && typed !== pincode) setPincode(typed);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once after hydration
  }, []);

  // Recalculate shipping, COD and totals when the pincode or payment method changes.
  useEffect(() => {
    const key = `${pincode}|${paymentMethod}`;
    if (pincode.length !== 6 || key === lastPreview.current) return;
    const t = setTimeout(() => {
      lastPreview.current = key;
      startRefresh(async () => {
        const next = await previewCheckoutAction({ pincode, paymentMethod, email: field("email")?.value ?? "" });
        if (next) {
          setView(next);
          if (paymentMethod === "COD" && next.paymentMethod !== "COD") setPaymentMethod("PREPAID");
        }
      });
    }, 350);
    return () => clearTimeout(t);
  }, [pincode, paymentMethod]);

  // Fill in city and state from the pincode when they're empty.
  useEffect(() => {
    if (pincode.length !== 6) return;
    const city = field("city");
    const state = field("state");
    if (!city || !state || (city.value && state.value)) return;
    let cancelled = false;
    lookupPincodeAction(pincode).then((d) => {
      if (cancelled || !d) return;
      if (!city.value) city.value = d.city;
      if (!state.value && d.state) state.value = d.state;
    });
    return () => {
      cancelled = true;
    };
  }, [pincode]);

  function applyAddress(a: SavedAddress) {
    for (const [k, v] of Object.entries({ name: a.name, phone: a.phone, line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, state: a.state, pincode: a.pincode })) {
      const el = field(k);
      if (el) el.value = v;
    }
    setPincode(a.pincode);
  }

  async function finishPayment(result: { ok: boolean; message: string; redirectTo: string } | "dismissed", orderNumber: string, token: string) {
    setSimulated(null);
    // Full page load so the header (cart count) reflects the emptied cart.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load refreshes the cart count in the header
    if (result === "dismissed") window.location.assign(`/orders/${orderNumber}?t=${token}&unpaid=1`);
    else window.location.assign(result.redirectTo + (result.ok ? "&placed=1" : ""));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (placing || view.totalPaise === null) return;
    const data = new FormData(e.currentTarget);
    const values = Object.fromEntries(TEXT_FIELDS.map((k) => [k, String(data.get(k) ?? "")]));
    setPlacing(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = await placeOrderAction({
        ...values,
        gstin: business ? values.gstin.toUpperCase() : "",
        businessName: business ? values.businessName : "",
        idempotencyKey,
        paymentMethod,
        expectedTotalPaise: view.totalPaise,
        marketingOptIn: data.get("marketingOptIn") === "on",
        saveAddress: data.get("saveAddress") === "on",
      });
      if (!result.ok) {
        setError(result.message);
        setFieldErrors(result.fieldErrors ?? {});
        if (result.view) setView(result.view);
        setIdempotencyKey(crypto.randomUUID());
        setPlacing(false);
        return;
      }
      if (!result.payment) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load refreshes the cart count in the header
        window.location.assign(`/orders/${result.orderNumber}?t=${result.token}&placed=1`);
        return;
      }
      const launch: LaunchInput = { payment: result.payment, orderNumber: result.orderNumber, token: result.token, prefill: { name: result.name, email: result.email, phone: result.phone } };
      if (result.payment.provider === "mock") {
        setSimulated(launch);
        return;
      }
      await finishPayment(await openRazorpay(launch), result.orderNumber, result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setPlacing(false);
    }
  }

  const err = (k: string) => fieldErrors[k] && <p className="mt-1 text-sm font-semibold text-chilli">{fieldErrors[k]}</p>;
  const inputClass = (k: string) => cn("field", fieldErrors[k] && "border-chilli");
  const canPlace = !view.hasIssues && view.totalPaise !== null && !refreshing;

  return (
    <form ref={formRef} onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_400px]" noValidate>
      <div className="space-y-8">
        <section className="card p-5 sm:p-6">
          <h2 className="mb-4 text-2xl">Contact</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="email" className="label">
                Email
              </label>
              <input id="email" type="email" autoComplete="email" required name="email" defaultValue={defaults.email} readOnly={!!props.customer} className={inputClass("email")} />
              {err("email")}
              <p className="mt-1 text-xs text-muted">For your order confirmation, invoice and tracking updates.</p>
            </div>
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="mb-4 text-2xl">Delivery address</h2>
          {props.addresses.length > 0 && (
            <div className="mb-5 flex flex-wrap gap-2">
              {props.addresses.map((a) => (
                <button key={a.id} type="button" onClick={() => applyAddress(a)} className="rounded-xl border border-line bg-ivory px-3 py-2 text-left text-sm hover:border-forest">
                  <span className="font-semibold text-forest">{a.name}</span>
                  <span className="block text-muted">
                    {a.line1}, {a.city} {a.pincode}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="label">
                Full name
              </label>
              <input id="name" autoComplete="name" name="name" defaultValue={defaults.name} className={inputClass("name")} />
              {err("name")}
            </div>
            <div>
              <label htmlFor="phone" className="label">
                Mobile number
              </label>
              <input id="phone" type="tel" inputMode="tel" autoComplete="tel" name="phone" defaultValue={defaults.phone} placeholder="10-digit mobile" className={inputClass("phone")} />
              {err("phone")}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="line1" className="label">
                House / flat, street
              </label>
              <input id="line1" autoComplete="address-line1" name="line1" defaultValue={defaults.line1} className={inputClass("line1")} />
              {err("line1")}
            </div>
            <div>
              <label htmlFor="line2" className="label">
                Area / locality <span className="font-normal text-muted">(optional)</span>
              </label>
              <input id="line2" autoComplete="address-line2" name="line2" defaultValue={defaults.line2} className="field" />
            </div>
            <div>
              <label htmlFor="landmark" className="label">
                Landmark <span className="font-normal text-muted">(optional)</span>
              </label>
              <input id="landmark" name="landmark" defaultValue={defaults.landmark} className="field" />
            </div>
            <div>
              <label htmlFor="pincode" className="label">
                Pincode
              </label>
              <input
                id="pincode"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={6}
                name="pincode"
                defaultValue={defaults.pincode}
                onChange={(e) => {
                  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setPincode(e.target.value);
                }}
                className={inputClass("pincode")}
              />
              {err("pincode")}
            </div>
            <div>
              <label htmlFor="city" className="label">
                City
              </label>
              <input id="city" autoComplete="address-level2" name="city" defaultValue={defaults.city} className={inputClass("city")} />
              {err("city")}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="state" className="label">
                State
              </label>
              <select id="state" autoComplete="address-level1" name="state" defaultValue={defaults.state} className={inputClass("state")}>
                <option value="">Choose a state</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
              {err("state")}
            </div>
          </div>
          {props.customer && (
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" name="saveAddress" defaultChecked={props.addresses.length === 0} className="size-4 accent-forest" />
              Save this address to my account
            </label>
          )}
          <details className="mt-4" open={business} onToggle={(e) => setBusiness((e.target as HTMLDetailsElement).open)}>
            <summary className="cursor-pointer text-sm font-semibold text-forest">Buying for a business? Add your GSTIN</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="gstin" className="label">
                  GSTIN
                </label>
                <input id="gstin" name="gstin" maxLength={15} className={cn(inputClass("gstin"), "uppercase")} />
                {err("gstin")}
              </div>
              <div>
                <label htmlFor="businessName" className="label">
                  Registered business name
                </label>
                <input id="businessName" name="businessName" className={inputClass("businessName")} />
                {err("businessName")}
              </div>
              <p className="text-xs text-muted sm:col-span-2">We&apos;ll issue a GST invoice in your business name, so you can claim input tax credit. For bulk orders, see our contact page.</p>
            </div>
          </details>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="mb-4 text-2xl">Payment</h2>
          <div className="space-y-3" role="radiogroup" aria-label="Payment method">
            <label className={cn("flex cursor-pointer gap-3 rounded-xl border p-4", paymentMethod === "PREPAID" ? "border-forest bg-forest/5" : "border-line")}>
              <input type="radio" name="pm" checked={paymentMethod === "PREPAID"} onChange={() => setPaymentMethod("PREPAID")} className="mt-1 accent-forest" />
              <span>
                <span className="font-semibold text-forest">Pay online</span>
                <span className="block text-sm text-muted">UPI, cards, net banking or wallets via Razorpay.</span>
              </span>
            </label>
            {view.cod.offered && (
              <label className={cn("flex gap-3 rounded-xl border p-4", !view.cod.available ? "cursor-not-allowed opacity-60" : "cursor-pointer", paymentMethod === "COD" ? "border-forest bg-forest/5" : "border-line")}>
                <input type="radio" name="pm" disabled={!view.cod.available} checked={paymentMethod === "COD"} onChange={() => setPaymentMethod("COD")} className="mt-1 accent-forest" />
                <span>
                  <span className="font-semibold text-forest">Cash on delivery{view.cod.feePaise > 0 ? ` (+${formatINR(view.cod.feePaise)})` : ""}</span>
                  <span className="block text-sm text-muted">{view.cod.available ? "Pay in cash or UPI when your order arrives. We'll email you a link to confirm the order." : view.cod.reason}</span>
                </span>
              </label>
            )}
          </div>
          <div className="mt-5">
            <label htmlFor="note" className="label">
              Order note <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea id="note" rows={2} maxLength={300} name="note" className="field" placeholder="Anything we should know about delivery?" />
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" name="marketingOptIn" className="mt-0.5 size-4 accent-forest" />
            <span>Email me about new spices and offers. (Optional; unsubscribe any time.)</span>
          </label>
        </section>
      </div>

      <aside className="h-fit lg:sticky lg:top-32">
        <div className="card space-y-4 p-5">
          <h2 className="text-2xl">Order summary</h2>
          <ul className="space-y-3">
            {view.lines.map((l) => (
              <li key={l.variantId} className="flex gap-3 text-sm">
                <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-sand">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {l.image && <img src={l.image} alt="" className="size-full object-cover" />}
                  <span className="absolute -top-0 -right-0 grid min-w-5 place-items-center rounded-bl-lg bg-forest px-1 text-[11px] font-bold text-ivory">{l.quantity}</span>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-forest">{l.productName}</p>
                  <p className="text-muted">{l.variantTitle}</p>
                  {l.issue && <p className="font-semibold text-chilli">{l.issue}</p>}
                </div>
                <p className="font-semibold">{formatINR(l.lineTotalPaise)}</p>
              </li>
            ))}
          </ul>
          <div aria-busy={refreshing} className={refreshing ? "opacity-60" : ""}>
            <Totals view={view} />
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <button type="submit" disabled={!canPlace || placing} className="w-full rounded-full bg-forest px-6 py-3.5 text-base font-bold text-ivory transition hover:bg-forest-deep disabled:cursor-not-allowed disabled:opacity-60">
            {placing ? "Placing your order…" : view.totalPaise === null ? "Enter a deliverable pincode" : paymentMethod === "COD" ? `Place order · ${formatINR(view.totalPaise)}` : `Pay ${formatINR(view.totalPaise)}`}
          </button>
          <p className="text-center text-xs text-muted">
            By placing your order you agree to our{" "}
            <a href="/policies/terms" className="underline" target="_blank">
              terms
            </a>{" "}
            and{" "}
            <a href="/policies/refunds" className="underline" target="_blank">
              refund policy
            </a>
            .
          </p>
        </div>
      </aside>
      {simulated && <SimulatedPaymentDialog input={simulated} onDone={(r) => finishPayment(r, simulated.orderNumber, simulated.token)} />}
    </form>
  );
}
