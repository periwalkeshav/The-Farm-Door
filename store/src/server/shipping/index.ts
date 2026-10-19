/**
 * Shipping quotes. Customers pay the actual courier rate for their pincode and
 * parcel weight (owner's choice), less any free-shipping rule. Quotes are cached
 * briefly to avoid repeated courier API calls while a customer edits the cart.
 */
import { env } from "@/lib/env";
import { isValidPincode } from "@/lib/india";
import type { SettingsValue } from "../settings";
import { mockProvider } from "./mock";
import { shiprocketProvider } from "./shiprocket";
import type { CourierOption, ShippingProvider } from "./types";

export * from "./types";

export function shippingProvider(): ShippingProvider {
  return env().SHIPPING_PROVIDER === "mock" ? mockProvider : shiprocketProvider;
}

export type ShippingQuote =
  | { status: "OK"; courier: CourierOption; provider: string; quotedAt: string }
  | { status: "UNSERVICEABLE" }
  | { status: "COD_UNAVAILABLE" }
  | { status: "ERROR"; message: string };

const cache = new Map<string, { at: number; quote: ShippingQuote }>();
const CACHE_MS = 10 * 60 * 1000;

export function chooseCourier(couriers: CourierOption[], recommendedId: string | null, choice: SettingsValue<"shipping">["courierChoice"]): CourierOption | null {
  if (couriers.length === 0) return null;
  const cheapest = [...couriers].sort((a, b) => a.costPaise - b.costPaise || (a.etaDays ?? 99) - (b.etaDays ?? 99))[0];
  if (choice === "CHEAPEST") return cheapest;
  if (choice === "FASTEST") return [...couriers].sort((a, b) => (a.etaDays ?? 99) - (b.etaDays ?? 99) || a.costPaise - b.costPaise)[0];
  return couriers.find((c) => c.courierId === recommendedId) ?? cheapest;
}

/** Parcel weight: packed weight of the items plus the box. */
export function parcelWeight(itemsWeightGrams: number, shipping: SettingsValue<"shipping">) {
  return itemsWeightGrams + shipping.packagingWeightGrams;
}

export async function quoteShipping(input: {
  deliveryPincode: string;
  weightGrams: number;
  cod: boolean;
  declaredValuePaise: number;
  shipping: SettingsValue<"shipping">;
}): Promise<ShippingQuote> {
  const { shipping } = input;
  if (!isValidPincode(input.deliveryPincode)) return { status: "UNSERVICEABLE" };
  if (!shipping.pickupPincode && env().SHIPPING_PROVIDER !== "mock") {
    return { status: "ERROR", message: "Shipping isn't set up yet (pickup pincode missing in Admin > Settings)." };
  }
  const provider = shippingProvider();
  const key = [provider.name, shipping.pickupPincode, input.deliveryPincode, input.weightGrams, input.cod ? 1 : 0, Math.ceil(input.declaredValuePaise / 50_000), shipping.courierChoice].join(":");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.quote;

  let quote: ShippingQuote;
  try {
    const result = await provider.checkServiceability({
      pickupPincode: shipping.pickupPincode,
      deliveryPincode: input.deliveryPincode,
      weightGrams: input.weightGrams,
      cod: input.cod,
      declaredValuePaise: input.declaredValuePaise,
      lengthCm: shipping.boxLengthCm,
      breadthCm: shipping.boxBreadthCm,
      heightCm: shipping.boxHeightCm,
    });
    const courier = chooseCourier(result.couriers, result.recommendedCourierId, shipping.courierChoice);
    if (courier) quote = { status: "OK", courier, provider: provider.name, quotedAt: new Date().toISOString() };
    else if (input.cod) {
      // Distinguish "no COD here" from "not deliverable at all".
      const prepaid = await provider.checkServiceability({
        pickupPincode: shipping.pickupPincode,
        deliveryPincode: input.deliveryPincode,
        weightGrams: input.weightGrams,
        cod: false,
        declaredValuePaise: input.declaredValuePaise,
        lengthCm: shipping.boxLengthCm,
        breadthCm: shipping.boxBreadthCm,
        heightCm: shipping.boxHeightCm,
      });
      quote = prepaid.serviceable ? { status: "COD_UNAVAILABLE" } : { status: "UNSERVICEABLE" };
    } else quote = { status: "UNSERVICEABLE" };
  } catch (err) {
    console.error("[shipping] quote failed:", err);
    // Don't cache errors.
    return { status: "ERROR", message: "We couldn't reach the courier service just now. Please try again in a moment." };
  }
  cache.set(key, { at: Date.now(), quote });
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  return quote;
}
