"use client";

import { useActionState, useState, type ReactNode } from "react";
import { saveSettingsAction, type SettingsResult } from "@/actions/admin/settings";
import { INDIAN_STATES } from "@/lib/india";
import type { AllSettings, SettingsKey } from "@/server/settings";

function SettingsForm({ k, children }: { k: SettingsKey; children: ReactNode }) {
  const [state, action, pending] = useActionState<SettingsResult, FormData>(saveSettingsAction.bind(null, k), null);
  return (
    <form action={action} className="space-y-4">
      {children}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-full bg-forest px-6 py-2.5 font-semibold text-ivory disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
        {state && <span className={`text-sm font-semibold ${state.ok ? "text-forest" : "text-chilli"}`}>{state.message}</span>}
      </div>
    </form>
  );
}

function Field({ name, label, value, hint, type = "text", inputMode, className }: { name: string; label: string; value: string | number; hint?: string; type?: string; inputMode?: "decimal" | "numeric" | "email" | "tel"; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={`s-${name}`} className="label">
        {label}
      </label>
      <input id={`s-${name}`} name={name} type={type} inputMode={inputMode} defaultValue={value} className="field" />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const rupees = (p: number | null) => (p === null ? "" : (p / 100).toString());

export function StoreSettingsForm({ s }: { s: AllSettings["store"] }) {
  return (
    <SettingsForm k="store">
      <div className="grid gap-4 md:grid-cols-2">
        <Field name="tradeName" label="Store name" value={s.tradeName} />
        <Field name="legalName" label="Legal business name" value={s.legalName} hint="As registered for GST. Appears on invoices." />
        <Field name="gstin" label="GSTIN" value={s.gstin} hint="Required on tax invoices." />
        <Field name="fssaiNumber" label="FSSAI licence / registration number" value={s.fssaiNumber} hint="Shown in the footer and product information." />
        <Field name="addressLine1" label="Registered address" value={s.addressLine1} />
        <Field name="addressLine2" label="Address line 2" value={s.addressLine2} />
        <Field name="city" label="City" value={s.city} />
        <div>
          <label htmlFor="s-state" className="label">
            State
          </label>
          <select id="s-state" name="state" defaultValue={s.state} className="field">
            <option value="">Choose</option>
            {INDIAN_STATES.map((st) => (
              <option key={st.code} value={st.name}>
                {st.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">Decides CGST+SGST vs IGST on invoices.</p>
        </div>
        <Field name="pincode" label="Pincode" value={s.pincode} inputMode="numeric" />
        <Field name="supportEmail" label="Customer support email" value={s.supportEmail} type="email" />
        <Field name="supportPhone" label="Customer support phone" value={s.supportPhone} inputMode="tel" />
        <Field name="whatsappNumber" label="WhatsApp number (optional)" value={s.whatsappNumber} inputMode="tel" />
        <Field name="instagramUrl" label="Instagram link (optional)" value={s.instagramUrl} />
        <Field name="facebookUrl" label="Facebook link (optional)" value={s.facebookUrl} />
      </div>
    </SettingsForm>
  );
}

export function ShippingSettingsForm({ s }: { s: AllSettings["shipping"] }) {
  const [free, setFree] = useState(s.freeShippingThresholdPaise !== null);
  return (
    <SettingsForm k="shipping">
      <div className="grid gap-4 md:grid-cols-3">
        <Field name="pickupPincode" label="Pickup pincode" value={s.pickupPincode} inputMode="numeric" hint="Must match your courier pickup address." />
        <div>
          <label htmlFor="s-courierChoice" className="label">
            Courier to charge and book
          </label>
          <select id="s-courierChoice" name="courierChoice" defaultValue={s.courierChoice} className="field">
            <option value="RECOMMENDED">Courier service&apos;s recommendation</option>
            <option value="CHEAPEST">Cheapest</option>
            <option value="FASTEST">Fastest</option>
          </select>
        </div>
        <Field name="handlingFee" label="Handling fee added to courier rate (₹)" value={rupees(s.handlingFeePaise)} inputMode="decimal" hint="0 = charge exactly the courier rate." />
        <Field name="packagingWeightGrams" label="Box & filler weight (g)" value={s.packagingWeightGrams} inputMode="numeric" />
        <Field name="boxLengthCm" label="Box length (cm)" value={s.boxLengthCm} inputMode="numeric" />
        <Field name="boxBreadthCm" label="Box breadth (cm)" value={s.boxBreadthCm} inputMode="numeric" />
        <Field name="boxHeightCm" label="Box height (cm)" value={s.boxHeightCm} inputMode="numeric" />
      </div>
      <div className="rounded-xl border border-line p-4">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="freeShippingOn" checked={free} onChange={(e) => setFree(e.target.checked)} className="size-4 accent-forest" /> Free shipping above an order value
        </label>
        {free && <Field name="freeShippingThreshold" label="Free shipping when items (after discount) reach ₹" value={rupees(s.freeShippingThresholdPaise)} inputMode="decimal" className="mt-3 max-w-xs" />}
      </div>
    </SettingsForm>
  );
}

export function CodSettingsForm({ s }: { s: AllSettings["cod"] }) {
  const [max, setMax] = useState(s.maxOrderPaise !== null);
  return (
    <SettingsForm k="cod">
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="enabled" defaultChecked={s.enabled} className="size-4 accent-forest" /> Offer cash on delivery
      </label>
      <div className="grid gap-4 md:grid-cols-3">
        <Field name="fee" label="COD fee (₹)" value={rupees(s.feePaise)} inputMode="decimal" hint="Added to COD orders. 0 = no fee." />
        <Field name="confirmationHours" label="Hours to confirm before auto-cancel" value={s.confirmationHours} inputMode="numeric" />
        <div>
          <label className="mt-7 flex items-center gap-2 text-sm">
            <input type="checkbox" name="maxOn" checked={max} onChange={(e) => setMax(e.target.checked)} className="size-4 accent-forest" /> Limit COD to orders up to…
          </label>
          {max && <Field name="maxOrder" label="Maximum COD order total (₹)" value={rupees(s.maxOrderPaise)} inputMode="decimal" className="mt-2" />}
        </div>
      </div>
      <div>
        <label htmlFor="s-blockedPincodes" className="label">
          Pincodes where COD isn&apos;t offered
        </label>
        <textarea id="s-blockedPincodes" name="blockedPincodes" rows={3} defaultValue={s.blockedPincodes.join(", ")} className="field" placeholder="e.g. 110001, 400001" />
        <p className="mt-1 text-xs text-muted">Separate with commas or spaces. The courier&apos;s own COD coverage is also checked automatically.</p>
      </div>
    </SettingsForm>
  );
}

export function CheckoutSettingsForm({ s }: { s: AllSettings["checkout"] }) {
  return (
    <SettingsForm k="checkout">
      <Field name="reservationMinutes" label="Minutes stock is held while a customer pays online" value={s.reservationMinutes} inputMode="numeric" className="max-w-sm" hint="Between 5 and 60. Unpaid orders are cancelled after this and the stock is released; a payment that still arrives later is honoured if stock allows, otherwise refunded automatically." />
    </SettingsForm>
  );
}

export function NotificationSettingsForm({ s }: { s: AllSettings["notifications"] }) {
  return (
    <SettingsForm k="notifications">
      <Field name="ownerEmail" label="Send store alerts to" value={s.ownerEmail} type="email" className="max-w-md" />
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="newOrderEmails" defaultChecked={s.newOrderEmails} className="size-4 accent-forest" /> Email me for every confirmed order
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="lowStockEmails" defaultChecked={s.lowStockEmails} className="size-4 accent-forest" /> Daily low-stock alert
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="dailySummary" defaultChecked={s.dailySummary} className="size-4 accent-forest" /> Morning summary of yesterday&apos;s orders and sales
        </label>
      </div>
    </SettingsForm>
  );
}
