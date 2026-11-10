"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { lookupPincodeAction, placeOrderAction, previewCheckoutAction } from "@/actions/checkout";
import { FieldError, useForm } from "@/components/form";
import { Notice, cn } from "@/components/ui";
import { checkoutSchema } from "@/lib/form-schemas";
import { INDIAN_STATES } from "@/lib/india";
import { formValues } from "@/lib/validation";
import { formatINR } from "@/lib/money";
import type { CheckoutView } from "@/server/checkout-view";
import { Totals } from "./order-summary";
import { openRazorpay, SimulatedPaymentDialog, type LaunchInput } from "./payment-launcher";
import { useI18n } from "@/i18n/client";
import { rich } from "@/i18n/rich";
import { translateParts } from "@/i18n/translate";

export type SavedAddress = { id: number; name: string; phone: string; line1: string; line2: string; landmark: string; city: string; state: string; pincode: string };

const TEXT_FIELDS = ["email", "phone", "name", "line1", "line2", "landmark", "city", "state", "pincode", "gstin", "businessName", "note"] as const;

export function CheckoutForm(props: { initialView: CheckoutView; customer: { email: string; name: string; phone: string } | null; addresses: SavedAddress[]; whatsappOn?: boolean }) {
  const { lang, t, href } = useI18n();
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
  const [usePoints, setUsePoints] = useState(false);
  const [view, setView] = useState(props.initialView);
  const [business, setBusiness] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [placing, setPlacing] = useState(false);
  const [simulated, setSimulated] = useState<LaunchInput | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const lastPreview = useRef("");
  // State the courier lists for the pincode, to catch a mismatch before the invoice uses the wrong state.
  const [pincodeState, setPincodeState] = useState<{ pincode: string; state: string } | null>(null);
  const [chosenState, setChosenState] = useState(defaults.state);

  const f = useForm({
    schema: checkoutSchema,
    // GSTIN fields only count when "Buying for a business?" is open.
    values: (fd) => ({ ...formValues(fd), gstin: business ? String(fd.get("gstin") ?? "") : "", businessName: business ? String(fd.get("businessName") ?? "") : "" }),
    serverErrors: fieldErrors,
    onValid: (fd) => void submit(fd),
  });

  const getForm = f.form;
  const field = useCallback((name: string) => getForm()?.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null, [getForm]);

  // Pick up a pincode typed before the page became interactive, or the one remembered from the header.
  useEffect(() => {
    const input = field("pincode") as HTMLInputElement | null;
    let typed = input?.value ?? "";
    if (!typed && input) {
      try {
        const remembered = JSON.parse(localStorage.getItem("tfd-pincode") ?? "null") as { pincode?: string } | null;
        if (remembered?.pincode && /^[1-9][0-9]{5}$/.test(remembered.pincode)) typed = input.value = remembered.pincode;
      } catch {
        // Nothing remembered.
      }
    }
    // Syncing from the DOM (an external source) once after hydration is the intended use here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (typed && typed !== pincode) setPincode(typed);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once after hydration
  }, []);

  // Recalculate shipping, COD and totals when the pincode or payment method changes.
  useEffect(() => {
    const key = `${pincode}|${paymentMethod}|${usePoints}`;
    if ((pincode.length > 0 && pincode.length !== 6) || key === lastPreview.current) return;
    const t = setTimeout(() => {
      lastPreview.current = key;
      startRefresh(async () => {
        const next = await previewCheckoutAction({ pincode, paymentMethod, email: field("email")?.value ?? "", usePoints, lang });
        if (next) {
          setView(next);
          if (paymentMethod === "COD" && next.paymentMethod !== "COD") setPaymentMethod("PREPAID");
        }
      });
    }, 350);
    return () => clearTimeout(t);
  }, [pincode, paymentMethod, usePoints, field, lang]);

  // Fill in city and state from the pincode when they're empty, and note which state the pincode is in.
  useEffect(() => {
    if (pincode.length !== 6) return;
    const city = field("city");
    const state = field("state");
    if (!city || !state) return;
    let cancelled = false;
    lookupPincodeAction(pincode).then((d) => {
      if (cancelled || !d) return;
      setPincodeState(d.state ? { pincode, state: d.state } : null);
      if (!city.value) city.value = d.city;
      if (!state.value && d.state) {
        state.value = d.state;
        setChosenState(d.state);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pincode, field]);

  function applyAddress(a: SavedAddress) {
    for (const [k, v] of Object.entries({ name: a.name, phone: a.phone, line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, state: a.state, pincode: a.pincode })) {
      const el = field(k);
      if (el) el.value = v;
    }
    setChosenState(a.state);
    setPincode(a.pincode);
    f.setErrors({});
  }

  async function finishPayment(result: { ok: boolean; message: string; redirectTo: string } | "dismissed", orderNumber: string, token: string) {
    setSimulated(null);
    // Full page load so the header (cart count) reflects the emptied cart.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load refreshes the cart count in the header
    if (result === "dismissed") window.location.assign(`${href(`/orders/${orderNumber}`)}?t=${token}&unpaid=1`);
    else window.location.assign(href(result.redirectTo) + (result.ok ? "&placed=1" : ""));
  }

  async function submit(data: FormData) {
    if (placing || view.totalPaise === null) return;
    const values = Object.fromEntries(TEXT_FIELDS.map((k) => [k, String(data.get(k) ?? "")]));
    setPlacing(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = await placeOrderAction({
        ...values,
        lang,
        gstin: business ? values.gstin.toUpperCase() : "",
        businessName: business ? values.businessName : "",
        idempotencyKey,
        paymentMethod,
        expectedTotalPaise: view.totalPaise,
        marketingOptIn: data.get("marketingOptIn") === "on",
        saveAddress: data.get("saveAddress") === "on",
        usePoints: usePoints && view.points.usable > 0,
        whatsappOptIn: !!props.whatsappOn && data.get("whatsappOptIn") === "on",
      });
      if (!result.ok) {
        setError(t(result.message));
        setFieldErrors(result.fieldErrors ?? {});
        if (result.view) setView(result.view);
        setIdempotencyKey(crypto.randomUUID());
        setPlacing(false);
        return;
      }
      if (!result.payment) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load refreshes the cart count in the header
        window.location.assign(`${href(`/orders/${result.orderNumber}`)}?t=${result.token}&placed=1`);
        return;
      }
      const launch: LaunchInput = { payment: result.payment, orderNumber: result.orderNumber, token: result.token, prefill: { name: result.name, email: result.email, phone: result.phone } };
      if (result.payment.provider === "mock") {
        setSimulated(launch);
        return;
      }
      await finishPayment(await openRazorpay(launch), result.orderNumber, result.token);
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t("Something went wrong. Please try again."));
      setPlacing(false);
    }
  }

  const pincodeMismatch = pincodeState && pincodeState.pincode === pincode && chosenState && chosenState !== pincodeState.state ? pincodeState.state : null;
  const canPlace = !view.hasIssues && view.totalPaise !== null && !refreshing;

  return (
    <form {...f.formProps} className="grid gap-8 lg:grid-cols-[1fr_400px]">
      <div className="space-y-8">
        <section className="card p-5 sm:p-6">
          <h2 className="mb-4 text-2xl">{t("Contact")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor={f.id("email")} className="label">
                {t("Email")}
              </label>
              <input {...f.field("email", { hint: true })} type="email" autoComplete="email" maxLength={200} defaultValue={defaults.email} readOnly={!!props.customer} className="field" />
              <FieldError f={f} name="email" />
              <p id={`${f.id("email")}-hint`} className="mt-1 text-xs text-muted">{t("For your order confirmation, invoice and tracking updates.")}</p>
            </div>
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="mb-4 text-2xl">{t("Delivery address")}</h2>
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
              <label htmlFor={f.id("name")} className="label">
                {t("Full name")}
              </label>
              <input {...f.field("name")} autoComplete="name" maxLength={80} defaultValue={defaults.name} className="field" />
              <FieldError f={f} name="name" />
            </div>
            <div>
              <label htmlFor={f.id("phone")} className="label">
                {t("Mobile number")}
              </label>
              <input {...f.field("phone")} type="tel" inputMode="tel" autoComplete="tel" maxLength={16} defaultValue={defaults.phone} placeholder={t("10-digit mobile")} className="field" />
              <FieldError f={f} name="phone" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={f.id("line1")} className="label">
                {t("House / flat, street")}
              </label>
              <input {...f.field("line1")} autoComplete="address-line1" maxLength={200} defaultValue={defaults.line1} className="field" />
              <FieldError f={f} name="line1" />
            </div>
            <div>
              <label htmlFor={f.id("line2")} className="label">
                {t("Area / locality")} <span className="font-normal text-muted">({t("optional")})</span>
              </label>
              <input {...f.field("line2")} autoComplete="address-line2" maxLength={200} defaultValue={defaults.line2} className="field" />
              <FieldError f={f} name="line2" />
            </div>
            <div>
              <label htmlFor={f.id("landmark")} className="label">
                {t("Landmark")} <span className="font-normal text-muted">({t("optional")})</span>
              </label>
              <input {...f.field("landmark")} maxLength={100} defaultValue={defaults.landmark} className="field" />
              <FieldError f={f} name="landmark" />
            </div>
            <div>
              <label htmlFor={f.id("pincode")} className="label">
                {t("Pincode")}
              </label>
              <input
                {...f.field("pincode")}
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={6}
                defaultValue={defaults.pincode}
                onChange={(e) => {
                  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setPincode(e.target.value);
                }}
                className="field"
              />
              <FieldError f={f} name="pincode" />
            </div>
            <div>
              <label htmlFor={f.id("city")} className="label">
                {t("City")}
              </label>
              <input {...f.field("city")} autoComplete="address-level2" maxLength={80} defaultValue={defaults.city} className="field" />
              <FieldError f={f} name="city" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={f.id("state")} className="label">
                {t("State")}
              </label>
              <select {...f.field("state")} autoComplete="address-level1" defaultValue={defaults.state} onChange={(e) => setChosenState(e.target.value)} className="field">
                <option value="">{t("Choose a state")}</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.name}>
                    {t(s.name)}
                  </option>
                ))}
              </select>
              <FieldError f={f} name="state" />
              {pincodeMismatch && !f.error("state") && (
                <p className="mt-1 text-sm text-[#6b4510]">
                  {t("Pincode {pincode} is in {state}.", { pincode, state: pincodeMismatch })}{" "}
                  <button
                    type="button"
                    className="font-semibold text-forest underline"
                    onClick={() => {
                      const el = field("state");
                      if (el) el.value = pincodeMismatch;
                      setChosenState(pincodeMismatch);
                    }}
                  >
                    {t("Use {state}", { state: pincodeMismatch })}
                  </button>
                </p>
              )}
            </div>
          </div>
          {props.customer && (
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" name="saveAddress" defaultChecked={props.addresses.length === 0} className="size-4 accent-forest" />
              {t("Save this address to my account")}
            </label>
          )}
          <details className="mt-4" open={business} onToggle={(e) => setBusiness((e.target as HTMLDetailsElement).open)}>
            <summary className="cursor-pointer text-sm font-semibold text-forest">{t("Buying for a business? Add your GSTIN")}</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={f.id("gstin")} className="label">
                  {t("GSTIN")}
                </label>
                <input {...f.field("gstin")} maxLength={15} autoComplete="off" className="field uppercase" placeholder={t("e.g. 08ABCDE1234F1Z0")} />
                <FieldError f={f} name="gstin" />
              </div>
              <div>
                <label htmlFor={f.id("businessName")} className="label">
                  {t("Registered business name")}
                </label>
                <input {...f.field("businessName")} autoComplete="organization" maxLength={120} className="field" />
                <FieldError f={f} name="businessName" />
              </div>
              <p className="text-xs text-muted sm:col-span-2">
                {rich(t("We'll issue a GST invoice in your business name, so you can claim input tax credit. For larger quantities, send a {link}."), {
                  link: (
                    <a href={href("/bulk-orders")} className="underline">
                      {t("bulk enquiry")}
                    </a>
                  ),
                })}
              </p>
            </div>
          </details>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="mb-4 text-2xl">{t("Payment")}</h2>
          <div className="space-y-3" role="radiogroup" aria-label={t("Payment method")}>
            <label className={cn("flex cursor-pointer gap-3 rounded-xl border p-4", paymentMethod === "PREPAID" ? "border-forest bg-forest/5" : "border-line")}>
              <input type="radio" name="pm" checked={paymentMethod === "PREPAID"} onChange={() => setPaymentMethod("PREPAID")} className="mt-1 accent-forest" />
              <span>
                <span className="font-semibold text-forest">{t("Pay online")}</span>
                <span className="block text-sm text-muted">{t("UPI, cards, net banking or wallets via Razorpay.")}</span>
              </span>
            </label>
            {view.cod.offered && (
              <label className={cn("flex gap-3 rounded-xl border p-4", !view.cod.available ? "cursor-not-allowed opacity-60" : "cursor-pointer", paymentMethod === "COD" ? "border-forest bg-forest/5" : "border-line")}>
                <input type="radio" name="pm" disabled={!view.cod.available} checked={paymentMethod === "COD"} onChange={() => setPaymentMethod("COD")} className="mt-1 accent-forest" />
                <span>
                  <span className="font-semibold text-forest">
                    {t("Cash on delivery")}
                    {view.cod.feePaise > 0 ? ` (+${formatINR(view.cod.feePaise)})` : ""}
                  </span>
                  <span className="block text-sm text-muted">{view.cod.available ? t("Pay in cash or UPI when your order arrives. We'll email you a link to confirm the order.") : t(view.cod.reason ?? "")}</span>
                </span>
              </label>
            )}
          </div>
          {view.points.enabled && view.points.balance > 0 && (
            <div className="mt-5 rounded-xl border border-saffron/40 bg-[#fdf3e1] p-4 text-sm">
              {view.points.usable > 0 ? (
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} className="mt-0.5 size-4 accent-forest" />
                  <span>
                    <span className="font-semibold text-forest">
                      {t("Use {points} points (−{amount})", { points: view.points.usable, amount: formatINR(view.points.valuePaise) })}
                    </span>
                    <span className="block text-muted">{t("You have {points} points.", { points: view.points.balance })}</span>
                  </span>
                </label>
              ) : (
                <p className="text-muted">
                  {t("You have {points} points. You can use them once you have {min}.", { points: view.points.balance, min: view.points.minToRedeem })}
                </p>
              )}
            </div>
          )}
          <div className="mt-5">
            <label htmlFor={f.id("note")} className="label">
              {t("Order note")} <span className="font-normal text-muted">({t("optional")})</span>
            </label>
            <textarea {...f.field("note")} rows={2} maxLength={300} className="field" placeholder={t("Anything we should know about delivery?")} />
            <FieldError f={f} name="note" />
          </div>
          {props.whatsappOn && (
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input type="checkbox" name="whatsappOptIn" className="mt-0.5 size-4 accent-forest" />
              <span>{t("Send me order updates on WhatsApp too (to the mobile number above).")}</span>
            </label>
          )}
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" name="marketingOptIn" className="mt-0.5 size-4 accent-forest" />
            <span>{t("Email me about new spices and offers. (Optional; unsubscribe any time.)")}</span>
          </label>
        </section>
      </div>

      <aside className="h-fit lg:sticky lg:top-32">
        <div className="card space-y-4 p-5">
          <h2 className="text-2xl">{t("Order summary")}</h2>
          <ul className="space-y-3">
            {view.lines.map((l) => (
              <li key={l.variantId} className="flex gap-3 text-sm">
                <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-sand">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {l.image && <img src={l.image} alt="" width={64} height={64} className="size-full object-cover" loading="lazy" decoding="async" />}
                  <span className="absolute -top-0 -right-0 grid min-w-5 place-items-center rounded-bl-lg bg-forest px-1 text-[11px] font-bold text-ivory">{l.quantity}</span>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-forest">{l.productName}</p>
                  <p className="text-muted">{translateParts(lang, l.variantTitle)}</p>
                  {l.issue && <p className="font-semibold text-chilli">{t(l.issue)}</p>}
                </div>
                <p className="font-semibold">{formatINR(l.lineTotalPaise)}</p>
              </li>
            ))}
          </ul>
          <div aria-busy={refreshing} className={refreshing ? "opacity-60" : ""}>
            <Totals view={view} lang={lang} />
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <button type="submit" disabled={!canPlace || placing} className="w-full rounded-full bg-forest px-6 py-3.5 text-base font-bold text-ivory transition hover:bg-forest-deep disabled:cursor-not-allowed disabled:opacity-60">
            {placing ? t("Placing your order…") : view.totalPaise === null ? t("Enter a deliverable pincode") : paymentMethod === "COD" ? t("Place order · {amount}", { amount: formatINR(view.totalPaise) }) : t("Pay {amount}", { amount: formatINR(view.totalPaise) })}
          </button>
          <p className="text-center text-xs text-muted">
            {rich(t("By placing your order you agree to our {terms} and {refunds}."), {
              terms: (
                <a href={href("/policies/terms")} className="underline" target="_blank">
                  {t("terms")}
                </a>
              ),
              refunds: (
                <a href={href("/policies/refunds")} className="underline" target="_blank">
                  {t("refund policy")}
                </a>
              ),
            })}
          </p>
        </div>
      </aside>
      {simulated && <SimulatedPaymentDialog input={simulated} onDone={(r) => finishPayment(r, simulated.orderNumber, simulated.token)} />}
    </form>
  );
}
