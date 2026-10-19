/**
 * Store settings, editable by the owner in Admin > Settings.
 * Stored as JSON rows in the `settings` table; every key has a schema and defaults.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db";
import { settings } from "@/db/schema";

const paise = z.number().int().min(0);

export const storeSettingsSchema = z.object({
  tradeName: z.string().default("The Farm Door"),
  legalName: z.string().default(""),
  gstin: z.string().default(""),
  fssaiNumber: z.string().default(""),
  addressLine1: z.string().default(""),
  addressLine2: z.string().default(""),
  city: z.string().default("Jaipur"),
  state: z.string().default("Rajasthan"),
  pincode: z.string().default(""),
  supportEmail: z.string().default(""),
  supportPhone: z.string().default(""),
  whatsappNumber: z.string().default(""),
  instagramUrl: z.string().default(""),
  facebookUrl: z.string().default(""),
  youtubeUrl: z.string().default(""),
});

export const shippingSettingsSchema = z.object({
  /** Pincode orders are dispatched from; must match the courier pickup address. */
  pickupPincode: z.string().default(""),
  /** Free shipping when items (after discount) reach this amount. null = off. */
  freeShippingThresholdPaise: paise.nullable().default(null),
  /** Added on top of the courier quote. 0 = charge the courier rate as-is. */
  handlingFeePaise: paise.default(0),
  /** Weight of box and filler added to every parcel. */
  packagingWeightGrams: z.number().int().min(0).default(80),
  boxLengthCm: z.number().min(1).default(20),
  boxBreadthCm: z.number().min(1).default(15),
  boxHeightCm: z.number().min(1).default(10),
  /** Which serviceable courier's rate the customer is charged (and which we book). */
  courierChoice: z.enum(["CHEAPEST", "FASTEST", "RECOMMENDED"]).default("RECOMMENDED"),
});

export const codSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  feePaise: paise.default(0),
  /** COD only for orders up to this total. null = no limit. */
  maxOrderPaise: paise.nullable().default(null),
  blockedPincodes: z.array(z.string()).default([]),
  /** Unconfirmed COD orders are cancelled after this many hours. */
  confirmationHours: z.number().int().min(1).max(168).default(24),
});

export const checkoutSettingsSchema = z.object({
  /** How long stock is held while a customer pays online. */
  reservationMinutes: z.number().int().min(5).max(60).default(15),
});

export const notificationSettingsSchema = z.object({
  ownerEmail: z.string().default(""),
  newOrderEmails: z.boolean().default(true),
  lowStockEmails: z.boolean().default(true),
  dailySummary: z.boolean().default(true),
});

export const SETTINGS = {
  store: storeSettingsSchema,
  shipping: shippingSettingsSchema,
  cod: codSettingsSchema,
  checkout: checkoutSettingsSchema,
  notifications: notificationSettingsSchema,
} as const;

export type SettingsKey = keyof typeof SETTINGS;
export type SettingsValue<K extends SettingsKey> = z.infer<(typeof SETTINGS)[K]>;
export type AllSettings = { [K in SettingsKey]: SettingsValue<K> };

export async function readSettings<K extends SettingsKey>(db: DbOrTx, key: K): Promise<SettingsValue<K>> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key));
  const parsed = SETTINGS[key].safeParse(row?.value ?? {});
  // Fall back to defaults if a stored value no longer matches the schema.
  return (parsed.success ? parsed.data : SETTINGS[key].parse({})) as SettingsValue<K>;
}

export async function readAllSettings(db: DbOrTx): Promise<AllSettings> {
  const rows = await db.select().from(settings);
  const out = {} as Record<string, unknown>;
  for (const key of Object.keys(SETTINGS) as SettingsKey[]) {
    const row = rows.find((r) => r.key === key);
    const parsed = SETTINGS[key].safeParse(row?.value ?? {});
    out[key] = parsed.success ? parsed.data : SETTINGS[key].parse({});
  }
  return out as AllSettings;
}

export async function writeSettings<K extends SettingsKey>(db: DbOrTx, key: K, value: SettingsValue<K>) {
  const data = SETTINGS[key].parse(value);
  await db
    .insert(settings)
    .values({ key, value: data })
    .onConflictDoUpdate({ target: settings.key, set: { value: data, updatedAt: new Date() } });
}

/** True when the business details needed on invoices and policy pages are filled in. */
export function missingStoreDetails(store: SettingsValue<"store">): string[] {
  const missing: string[] = [];
  if (!store.legalName) missing.push("Legal business name");
  if (!store.addressLine1 || !store.pincode) missing.push("Registered address");
  if (!store.gstin) missing.push("GSTIN");
  if (!store.fssaiNumber) missing.push("FSSAI licence/registration number");
  if (!store.supportEmail) missing.push("Support email");
  if (!store.supportPhone) missing.push("Support phone");
  return missing;
}
