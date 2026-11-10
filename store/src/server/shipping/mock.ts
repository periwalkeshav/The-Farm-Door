/**
 * SIMULATED courier for local development and automated tests only.
 * Rates and delivery estimates here are made up and labelled as such in the UI
 * ("Simulated courier (test)"). env() refuses to run with this in production.
 */
import { createHash } from "node:crypto";
import type { NormalizedShipmentStatus, ServiceabilityQuery, ServiceabilityResult, ShipmentRequest, ShippingProvider } from "./types";

/** Pincodes the simulator treats as unserviceable, so the "can't deliver" path can be tested. */
export const MOCK_UNSERVICEABLE_PINCODES = ["999999", "111111"];

function zoneFor(from: string, to: string) {
  if (from.slice(0, 3) === to.slice(0, 3)) return { base: 4500, days: 2 };
  if (from[0] === to[0]) return { base: 6000, days: 3 };
  if (/^(79|78|18|19)/.test(to)) return { base: 11000, days: 7 }; // North-East, J&K
  return { base: 8000, days: 5 };
}

function addDays(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const mockProvider: ShippingProvider = {
  name: "mock",
  isSimulated: true,

  async checkServiceability(q: ServiceabilityQuery): Promise<ServiceabilityResult> {
    if (MOCK_UNSERVICEABLE_PINCODES.includes(q.deliveryPincode)) return { serviceable: false, couriers: [], recommendedCourierId: null };
    const zone = zoneFor(q.pickupPincode || "302001", q.deliveryPincode);
    const extraSlabs = Math.max(0, Math.ceil(q.weightGrams / 500) - 1);
    const codCharge = q.cod ? 3000 : 0;
    const surface = zone.base + extraSlabs * 2500 + codCharge;
    const air = Math.round(surface * 1.6);
    return {
      serviceable: true,
      recommendedCourierId: "SIM-SURFACE",
      couriers: [
        { courierId: "SIM-SURFACE", name: "Simulated courier (test) · Surface", costPaise: surface, etaDays: zone.days, etaDate: addDays(zone.days), cod: true, rating: 4.2 },
        { courierId: "SIM-AIR", name: "Simulated courier (test) · Air", costPaise: air, etaDays: Math.max(1, zone.days - 2), etaDate: addDays(Math.max(1, zone.days - 2)), cod: true, rating: 4.5 },
      ],
    };
  },

  async createShipment(r: ShipmentRequest) {
    const awb = r.existing?.awb ?? `SIM${createHash("sha1").update(r.orderNumber).digest("hex").slice(0, 10).toUpperCase()}`;
    return {
      providerOrderId: r.existing?.providerOrderId ?? `SIM-${r.orderNumber}`,
      providerShipmentId: r.existing?.providerShipmentId ?? `SIM-SHIP-${r.orderNumber}`,
      awb,
      courierName: r.courierId === "SIM-AIR" ? "Simulated courier (test) · Air" : "Simulated courier (test) · Surface",
      labelUrl: "",
      trackingUrl: "",
      pickupScheduledAt: null,
    };
  },

  async track() {
    // The simulator never advances on its own; use Admin > Order > "Simulate courier update" in development.
    return { status: null as NormalizedShipmentStatus | null, rawStatus: "", etaDate: null, events: [] };
  },

  async cancelShipment() {},

  async postcodeDetails(pincode: string) {
    if (pincode.startsWith("302")) return { city: "Jaipur", state: "Rajasthan" };
    if (pincode.startsWith("110")) return { city: "New Delhi", state: "Delhi" };
    if (pincode.startsWith("400")) return { city: "Mumbai", state: "Maharashtra" };
    if (pincode.startsWith("560")) return { city: "Bengaluru", state: "Karnataka" };
    return null;
  },
  async combinedLabel() {
    return null;
  },
};
