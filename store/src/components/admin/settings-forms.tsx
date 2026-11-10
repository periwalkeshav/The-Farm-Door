"use client";

import { createContext, use, useActionState, useState, type ReactNode } from "react";
import { saveSettingsAction, type SettingsResult } from "@/actions/admin/settings";
import { Field as FormField, type FormApi, useForm } from "@/components/form";
import { SETTINGS_FORM_SCHEMAS } from "@/lib/form-schemas";
import { INDIAN_STATES } from "@/lib/india";
import type { AllSettings, SettingsKey } from "@/server/settings";

const FormCtx = createContext<FormApi | null>(null);
const useSettingsForm = () => use(FormCtx)!;

function SettingsForm({ k, children }: { k: SettingsKey; children: ReactNode }) {
  const [state, action, pending] = useActionState<SettingsResult, FormData>(saveSettingsAction.bind(null, k), null);
  const f = useForm({ schema: SETTINGS_FORM_SCHEMAS[k], action, state });
  const hasFieldErrors = Object.keys(f.errors).length > 0;
  return (
    <FormCtx value={f}>
      <form {...f.formProps} className="space-y-4">
        {children}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="rounded-full bg-forest px-6 py-2.5 font-semibold text-ivory disabled:opacity-60">
            {pending ? "Saving…" : "Save"}
          </button>
          {hasFieldErrors ? (
            <span className="text-sm font-semibold text-chilli">Please fix the highlighted fields.</span>
          ) : (
            state && <span className={`text-sm font-semibold ${state.ok ? "text-forest" : "text-chilli"}`}>{state.message}</span>
          )}
        </div>
      </form>
    </FormCtx>
  );
}

function Field({ name, label, value, hint, type = "text", inputMode, className, placeholder }: { name: string; label: string; value: string | number; hint?: string; type?: string; inputMode?: "decimal" | "numeric" | "email" | "tel"; className?: string; placeholder?: string }) {
  const f = useSettingsForm();
  return (
    <FormField f={f} name={name} label={label} hint={hint} className={className}>
      <input {...f.field(name, { hint: !!hint })} type={type} inputMode={inputMode} defaultValue={value} placeholder={placeholder} className="field" />
    </FormField>
  );
}

function SelectField({ name, label, value, hint, children }: { name: string; label: string; value: string; hint?: string; children: ReactNode }) {
  const f = useSettingsForm();
  return (
    <FormField f={f} name={name} label={label} hint={hint}>
      <select {...f.field(name, { hint: !!hint })} defaultValue={value} className="field">
        {children}
      </select>
    </FormField>
  );
}

const rupees = (p: number | null) => (p === null ? "" : (p / 100).toString());

export function StoreSettingsForm({ s }: { s: AllSettings["store"] }) {
  return (
    <SettingsForm k="store">
      <div className="grid gap-4 md:grid-cols-2">
        <Field name="tradeName" label="Store name" value={s.tradeName} />
        <Field name="legalName" label="Legal business name" value={s.legalName} hint="As registered for GST, e.g. “… Private Limited”. Appears on invoices." />
        <Field name="cin" label="CIN (company identification number)" value={s.cin} placeholder="U01100RJ2025PTC012345" hint="21 characters, from your incorporation certificate. Shown on invoices and the contact page." />
        <Field name="gstin" label="GSTIN" value={s.gstin} placeholder="08ABCDE1234F1Z0" hint="Required on tax invoices. Its first two digits must match the state." />
        <Field name="fssaiNumber" label="FSSAI licence / registration number" value={s.fssaiNumber} inputMode="numeric" hint="14 digits. Shown in the footer and on invoices." />
        <Field name="addressLine1" label="Registered address" value={s.addressLine1} />
        <Field name="addressLine2" label="Address line 2" value={s.addressLine2} />
        <Field name="city" label="City" value={s.city} />
        <SelectField name="state" label="State" value={s.state} hint="Decides CGST+SGST vs IGST on invoices. Must match the GSTIN.">
          <option value="">Choose</option>
          {INDIAN_STATES.map((st) => (
            <option key={st.code} value={st.name}>
              {st.name}
            </option>
          ))}
        </SelectField>
        <Field name="pincode" label="Pincode" value={s.pincode} inputMode="numeric" placeholder="302001" />
        <Field name="supportEmail" label="Customer support email" value={s.supportEmail} type="email" />
        <Field name="supportPhone" label="Customer support phone" value={s.supportPhone} inputMode="tel" placeholder="+91 98765 43210" />
        <Field name="supportHours" label="Support hours" value={s.supportHours} hint="e.g. Mon–Sat, 10 am – 6 pm" />
        <Field name="whatsappNumber" label="WhatsApp number (optional)" value={s.whatsappNumber} inputMode="tel" placeholder="10-digit mobile" />
        <Field name="instagramUrl" label="Instagram link (optional)" value={s.instagramUrl} placeholder="https://instagram.com/…" />
        <Field name="facebookUrl" label="Facebook link (optional)" value={s.facebookUrl} placeholder="https://facebook.com/…" />
        <Field name="youtubeUrl" label="YouTube link (optional)" value={s.youtubeUrl} placeholder="https://youtube.com/@…" />
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
        <SelectField name="courierChoice" label="Courier to charge and book" value={s.courierChoice} hint="Compared across every courier Shiprocket offers for the pincode, including Blue Dart (DHL Group).">
          <option value="CHEAPEST">Cheapest</option>
          <option value="RECOMMENDED">Courier service&apos;s recommendation</option>
          <option value="FASTEST">Fastest</option>
        </SelectField>
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
        <BlockedPincodes value={s.blockedPincodes.join(", ")} />
      </div>
    </SettingsForm>
  );
}

function BlockedPincodes({ value }: { value: string }) {
  const f = useSettingsForm();
  return (
    <FormField f={f} name="blockedPincodes" label="Pincodes where COD isn't offered" hint="Separate with commas or spaces. The courier's own COD coverage is also checked automatically.">
      <textarea {...f.field("blockedPincodes", { hint: true })} rows={3} defaultValue={value} className="field" placeholder="e.g. 110001, 400001" />
    </FormField>
  );
}

export function CheckoutSettingsForm({ s }: { s: AllSettings["checkout"] }) {
  return (
    <SettingsForm k="checkout">
      <Field name="reservationMinutes" label="Minutes stock is held while a customer pays online" value={s.reservationMinutes} inputMode="numeric" className="max-w-sm" hint="Between 5 and 60. Unpaid orders are cancelled after this and the stock is released; a payment that still arrives later is honoured if stock allows, otherwise refunded automatically." />
    </SettingsForm>
  );
}

export function LoyaltySettingsForm({ s }: { s: AllSettings["loyalty"] }) {
  const pctBack = ((s.pointsPerHundredRupees * s.pointValuePaise) / 100).toFixed(1).replace(/\.0$/, "");
  return (
    <SettingsForm k="loyalty">
      <div className="rounded-xl border border-line p-4">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="pointsEnabled" defaultChecked={s.pointsEnabled} className="size-4 accent-forest" /> Loyalty points
        </label>
        <p className="mt-1 text-xs text-muted">
          Customers earn points when an order is delivered and can use them at checkout (signed in). Currently worth {pctBack}% back. Points are a discount, so invoices show the reduced price and GST.
        </p>
        <div className="mt-3 grid gap-4 md:grid-cols-4">
          <Field name="pointsPerHundredRupees" label="Points per ₹100 spent" value={s.pointsPerHundredRupees} inputMode="numeric" />
          <Field name="pointValue" label="One point is worth (₹)" value={rupees(s.pointValuePaise)} inputMode="decimal" />
          <Field name="maxRedeemPercent" label="Max % of items paid with points" value={s.maxRedeemPercent} inputMode="numeric" />
          <Field name="minPointsToRedeem" label="Minimum points to use" value={s.minPointsToRedeem} inputMode="numeric" />
        </div>
      </div>
      <div className="rounded-xl border border-line p-4">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="referralsEnabled" defaultChecked={s.referralsEnabled} className="size-4 accent-forest" /> Refer a friend
        </label>
        <p className="mt-1 text-xs text-muted">Each customer gets a personal code (on their account page). A new customer using it gets a discount on their first order; the referrer gets points when that order is delivered (points must be on too).</p>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <Field name="referralDiscountPercent" label="Friend's discount (%)" value={s.referralDiscountPercent} inputMode="numeric" />
          <Field name="referralMaxDiscount" label="Up to (₹)" value={rupees(s.referralMaxDiscountPaise)} inputMode="decimal" />
          <Field name="referralRewardPoints" label="Points for the referrer" value={s.referralRewardPoints} inputMode="numeric" />
        </div>
      </div>
    </SettingsForm>
  );
}

export function WhatsAppSettingsForm({ s, ready }: { s: AllSettings["whatsapp"]; ready: boolean }) {
  return (
    <SettingsForm k="whatsapp">
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="enabled" defaultChecked={s.enabled} className="size-4 accent-forest" /> Offer WhatsApp order updates at checkout
      </label>
      {!ready && <p className="text-xs text-chilli">The server isn&apos;t connected to WhatsApp yet, so nothing will be offered or sent even if this is on.</p>}
    </SettingsForm>
  );
}

export function AnalyticsSettingsForm({ s }: { s: AllSettings["analytics"] }) {
  return (
    <SettingsForm k="analytics">
      <Field
        name="gaMeasurementId"
        label="Google Analytics measurement ID"
        value={s.gaMeasurementId}
        className="max-w-sm"
        hint="Optional, e.g. G-XXXXXXXXXX (Google Analytics › Admin › Data streams). When set, visitors see a cookie banner and analytics only loads if they accept. Leave empty for no analytics."
      />
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
      <div className="border-t border-line pt-4">
        <p className="mb-2 text-sm font-semibold text-forest">Customer reminders</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="unpaidReminder" defaultChecked={s.unpaidReminder} className="size-4 accent-forest" /> Send one reminder when someone places an online-payment order but doesn&apos;t pay
        </label>
        <Field
          name="unpaidReminderHours"
          label="Hours after the order to send it"
          value={s.unpaidReminderHours}
          inputMode="numeric"
          className="mt-3 max-w-xs"
          hint="1–24. At most one reminder per email address a week; never after they order again or opt out."
        />
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" name="reviewRequests" defaultChecked={s.reviewRequests} className="size-4 accent-forest" /> Ask customers for a review after delivery
        </label>
        <Field name="reviewRequestDays" label="Days after delivery to ask" value={s.reviewRequestDays} inputMode="numeric" className="mt-3 max-w-xs" hint="1–30. One email per order, only for products they haven't reviewed yet." />
      </div>
    </SettingsForm>
  );
}
