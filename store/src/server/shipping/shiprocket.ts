/**
 * Shiprocket integration (https://apidocs.shiprocket.in).
 * Base URL: https://apiv2.shiprocket.in/v1/external. Auth: Bearer token from
 * POST /auth/login using a dedicated API user (Settings > API in Shiprocket).
 */
import { env } from "@/lib/env";
import { INDIAN_STATES } from "@/lib/india";
import type {
  CourierOption,
  CreatedShipment,
  NormalizedShipmentStatus,
  ServiceabilityQuery,
  ServiceabilityResult,
  ShipmentRequest,
  ShippingProvider,
  TrackingResult,
} from "./types";
import { ShipmentStepError } from "./types";

const BASE = "https://apiv2.shiprocket.in/v1/external";
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000; // tokens are long-lived; refresh well before expiry

let token: { value: string; expiresAt: number } | null = null;

export class ShiprocketError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
  }
}

async function login(): Promise<string> {
  const e = env();
  if (!e.SHIPROCKET_EMAIL || !e.SHIPROCKET_PASSWORD) throw new Error("Shiprocket API credentials are not configured.");
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: e.SHIPROCKET_EMAIL, password: e.SHIPROCKET_PASSWORD }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { token?: string; message?: string };
  if (!res.ok || !body.token) throw new ShiprocketError(`Shiprocket login failed: ${body.message ?? res.status}`, res.status, body);
  token = { value: body.token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return body.token;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, retried = false): Promise<T> {
  const bearer = token && token.expiresAt > Date.now() ? token.value : await login();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401 && !retried) {
    token = null;
    return call<T>(method, path, body, true);
  }
  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new ShiprocketError(`Shiprocket ${path} failed (${res.status}): ${json?.message ?? "unknown error"}`, res.status, json);
  return json;
}

const rupees = (paise: number) => Math.round(paise) / 100;

/** "Jul 01, 2024" or "2024-07-01 10:00:00" → "2024-07-01" */
function toIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value.replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T"));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/** Shiprocket shipment status IDs → our normalised shipment status. */
export function mapShiprocketStatus(id: number | string | null | undefined): NormalizedShipmentStatus | null {
  const n = Number(id);
  if ([27, 19, 15, 13, 20, 52].includes(n)) return "PICKUP_SCHEDULED";
  if ([6, 42, 18, 38, 22, 39, 48, 50, 51, 68].includes(n)) return "IN_TRANSIT";
  if (n === 17) return "OUT_FOR_DELIVERY";
  if ([7, 23, 26].includes(n)) return "DELIVERED";
  if ([21, 77, 12, 24, 25, 44, 76].includes(n)) return "DELIVERY_FAILED";
  if ([9, 14, 40, 41, 46, 75, 78].includes(n)) return "RTO_INITIATED";
  if (n === 10) return "RTO_DELIVERED";
  if ([8, 16, 45].includes(n)) return "CANCELLED";
  return null;
}

type SrCourier = {
  courier_company_id: number;
  courier_name: string;
  rate: number;
  estimated_delivery_days?: string | number;
  etd?: string;
  cod: number;
  rating?: number;
  blocked?: number;
};

export function shiprocketTrackingUrl(awb: string) {
  return `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`;
}

export const shiprocketProvider: ShippingProvider = {
  name: "shiprocket",
  isSimulated: false,

  async checkServiceability(q: ServiceabilityQuery): Promise<ServiceabilityResult> {
    const params = new URLSearchParams({
      pickup_postcode: q.pickupPincode,
      delivery_postcode: q.deliveryPincode,
      cod: q.cod ? "1" : "0",
      weight: (Math.max(q.weightGrams, 1) / 1000).toFixed(3),
      length: String(Math.ceil(q.lengthCm)),
      breadth: String(Math.ceil(q.breadthCm)),
      height: String(Math.ceil(q.heightCm)),
      declared_value: String(Math.ceil(q.declaredValuePaise / 100)),
    });
    let body: { status?: number; data?: { available_courier_companies?: SrCourier[]; recommended_courier_company_id?: number } };
    try {
      body = await call("GET", `/courier/serviceability/?${params}`);
    } catch (err) {
      // Shiprocket answers 404 when no courier serves the pincode.
      if (err instanceof ShiprocketError && err.status === 404) return { serviceable: false, couriers: [], recommendedCourierId: null };
      throw err;
    }
    const list = body.data?.available_courier_companies ?? [];
    const couriers: CourierOption[] = list
      .filter((c) => !c.blocked && (!q.cod || c.cod === 1))
      .map((c) => ({
        courierId: String(c.courier_company_id),
        name: c.courier_name,
        costPaise: Math.round(Number(c.rate) * 100),
        etaDays: c.estimated_delivery_days !== undefined && c.estimated_delivery_days !== "" ? Number(c.estimated_delivery_days) : null,
        etaDate: toIsoDate(c.etd),
        cod: c.cod === 1,
        rating: typeof c.rating === "number" ? c.rating : null,
      }))
      .filter((c) => Number.isFinite(c.costPaise) && c.costPaise > 0);
    const rec = body.data?.recommended_courier_company_id;
    return { serviceable: couriers.length > 0, couriers, recommendedCourierId: rec ? String(rec) : null };
  },

  async createShipment(r: ShipmentRequest): Promise<CreatedShipment> {
    const e = env();
    if (!e.SHIPROCKET_PICKUP_LOCATION) throw new Error("SHIPROCKET_PICKUP_LOCATION is not configured.");
    let providerOrderId = r.existing?.providerOrderId ?? "";
    let providerShipmentId = r.existing?.providerShipmentId ?? "";
    let awb = r.existing?.awb ?? null;
    let courierName = "";

    try {
      if (!providerShipmentId) {
        const ist = new Date(r.orderDate.getTime() + 5.5 * 3600_000).toISOString();
        const [firstName, ...rest] = r.customer.name.trim().split(/\s+/);
        const created = await call<{ order_id: number; shipment_id: number }>("POST", "/orders/create/adhoc", {
          order_id: r.orderNumber,
          order_date: `${ist.slice(0, 10)} ${ist.slice(11, 16)}`,
          pickup_location: e.SHIPROCKET_PICKUP_LOCATION,
          billing_customer_name: firstName,
          billing_last_name: rest.join(" "),
          billing_address: r.customer.line1,
          billing_address_2: r.customer.line2,
          billing_city: r.customer.city,
          billing_pincode: r.customer.pincode,
          billing_state: r.customer.state,
          billing_country: "India",
          billing_email: r.customer.email,
          billing_phone: r.customer.phone,
          shipping_is_billing: true,
          order_items: r.items.map((i) => ({
            name: i.name,
            sku: i.sku,
            units: i.units,
            selling_price: rupees(i.unitPricePaise),
            tax: i.gstRateBp / 100,
            hsn: i.hsn,
          })),
          payment_method: r.paymentMethod === "COD" ? "COD" : "Prepaid",
          // Amount to collect on delivery = sub_total − total_discount + shipping + transaction charges.
          sub_total: rupees(r.subtotalPaise),
          total_discount: rupees(r.discountPaise),
          shipping_charges: rupees(r.shippingPaise),
          transaction_charges: rupees(r.codFeePaise),
          length: Math.ceil(r.lengthCm),
          breadth: Math.ceil(r.breadthCm),
          height: Math.ceil(r.heightCm),
          weight: Number((Math.max(r.weightGrams, 1) / 1000).toFixed(3)),
          customer_gstin: r.customerGstin || undefined,
          invoice_number: r.invoiceNumber || undefined,
        });
        providerOrderId = String(created.order_id);
        providerShipmentId = String(created.shipment_id);
      }

      if (!awb) {
        const assigned = await call<{ awb_assign_status: number; response?: { data?: { awb_code?: string; courier_name?: string } }; message?: string }>(
          "POST",
          "/courier/assign/awb",
          { shipment_id: Number(providerShipmentId), ...(r.courierId ? { courier_id: Number(r.courierId) } : {}) },
        );
        const data = assigned.response?.data;
        if (assigned.awb_assign_status !== 1 || !data?.awb_code) {
          throw new Error(`Courier assignment failed${assigned.message ? `: ${assigned.message}` : ""}. Check your Shiprocket wallet balance and pickup address.`);
        }
        awb = data.awb_code;
        courierName = data.courier_name ?? "";
      }

      let pickupScheduledAt: string | null = null;
      try {
        const pickup = await call<{ pickup_status: number; response?: { pickup_scheduled_date?: string } }>("POST", "/courier/generate/pickup", {
          shipment_id: [Number(providerShipmentId)],
        });
        pickupScheduledAt = pickup.response?.pickup_scheduled_date ?? null;
      } catch (err) {
        // A pickup may already be scheduled for this shipment; the label is still usable.
        console.warn(`[shiprocket] pickup request for shipment ${providerShipmentId} failed:`, err instanceof Error ? err.message : err);
      }

      const label = await call<{ label_created: number; label_url?: string }>("POST", "/courier/generate/label", { shipment_id: [Number(providerShipmentId)] });

      return {
        providerOrderId,
        providerShipmentId,
        awb,
        courierName,
        labelUrl: label.label_url ?? "",
        trackingUrl: shiprocketTrackingUrl(awb),
        pickupScheduledAt,
      };
    } catch (err) {
      throw new ShipmentStepError(err instanceof Error ? err.message : String(err), { providerOrderId, providerShipmentId, awb });
    }
  },

  async track(awb: string): Promise<TrackingResult> {
    const body = await call<{
      tracking_data?: {
        shipment_status?: number;
        etd?: string;
        shipment_track?: { current_status?: string; edd?: string | null }[];
        shipment_track_activities?: { date: string; activity: string; location: string; "sr-status": string; "sr-status-label": string }[];
      };
    }>("GET", `/courier/track/awb/${encodeURIComponent(awb)}`);
    const t = body.tracking_data ?? {};
    return {
      status: mapShiprocketStatus(t.shipment_status),
      rawStatus: t.shipment_track?.[0]?.current_status ?? "",
      etaDate: toIsoDate(t.etd ?? t.shipment_track?.[0]?.edd),
      events: (t.shipment_track_activities ?? []).map((a) => ({
        status: a["sr-status-label"] && a["sr-status-label"] !== "NA" ? a["sr-status-label"] : a.activity,
        description: a.activity,
        location: a.location ?? "",
        occurredAt: new Date(`${a.date.replace(" ", "T")}+05:30`),
      })),
    };
  },

  async cancelShipment(awb: string) {
    await call("POST", "/orders/cancel/shipment/awbs", { awbs: [awb] });
  },

  async postcodeDetails(pincode: string) {
    try {
      const body = await call<{ success?: boolean; postcode_details?: { city?: string; state?: string } }>(
        "GET",
        `/open/postcode/details?postcode=${encodeURIComponent(pincode)}`,
      );
      const d = body.postcode_details;
      if (!body.success || !d?.city || !d.state) return null;
      const state = INDIAN_STATES.find((s) => s.name.toLowerCase() === d.state!.toLowerCase())?.name ?? d.state;
      return { city: d.city, state };
    } catch {
      return null;
    }
  },
};
