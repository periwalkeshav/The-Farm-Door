import { addToCart, createCart } from "@/server/cart";
import { summarizeCart } from "@/server/checkout";
import { placeOrder } from "@/server/orders/place";
import { storeSettingsSchema, writeSettings } from "@/server/settings";
import { db, makeProductWithVariant } from "./db";

/** Places a one-item order to a Bengaluru address (shipping from Jaipur). */
export async function placedOrder(paymentMethod: "PREPAID" | "COD", email = "k@example.com") {
  await writeSettings(db, "shipping", {
    pickupPincode: "302001",
    freeShippingThresholdPaise: null,
    handlingFeePaise: 0,
    packagingWeightGrams: 80,
    boxLengthCm: 20,
    boxBreadthCm: 15,
    boxHeightCm: 10,
    courierChoice: "RECOMMENDED",
  });
  await writeSettings(db, "store", { ...storeSettingsSchema.parse({}), state: "Rajasthan" });
  const { variant } = await makeProductWithVariant();
  const cart = await createCart(db, null);
  await addToCart(db, cart.id, variant.id, 1);
  const summary = await summarizeCart(db, { cartId: cart.id, couponCode: null, pincode: "560001", paymentMethod, email });
  const r = await placeOrder(db, {
    cartId: cart.id,
    couponCode: null,
    signedInCustomerId: null,
    idempotencyKey: crypto.randomUUID(),
    email,
    phone: "9876543210",
    name: "Kiran Rao",
    line1: "4 MG Road",
    line2: "",
    landmark: "",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
    gstin: "",
    businessName: "",
    paymentMethod,
    expectedTotalPaise: summary.breakdown.totalPaise!,
    marketingOptIn: false,
    saveAddress: false,
    note: "",
  });
  if (!r.ok) throw new Error(r.message);
  return r;
}
