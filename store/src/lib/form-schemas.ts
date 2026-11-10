/**
 * Form schemas used in both places: the browser checks them for instant
 * feedback, and the server actions check them again before saving anything.
 */
import { z } from "zod";
import { INDIAN_STATES, isValidPincode, normalizeIndianMobile } from "./india";
import { passwordProblem } from "./password";
import { gstinMatchesState, rules } from "./validation";

const checkbox = z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean());

/* ------------------------------------------------------------------ */
/* Shop                                                                */
/* ------------------------------------------------------------------ */

export const checkoutFields = z.object({
  email: rules.email(),
  phone: rules.mobile("Enter a mobile number for the courier."),
  name: rules.personName("Enter the recipient's full name."),
  line1: rules.requiredText("Enter the house/flat number and street.", 5, 200, "The address"),
  line2: rules.optionalText(200, "Area / locality"),
  landmark: rules.optionalText(100, "The landmark"),
  city: rules.city(),
  state: rules.state(),
  pincode: rules.pincode(),
  gstin: rules.gstin(),
  businessName: rules.optionalText(120, "The business name"),
  note: rules.optionalText(300, "The order note"),
});

/** Cross-field checks shared by the browser and the server. */
export function refineCheckout(v: { gstin: string; businessName: string }, ctx: z.RefinementCtx) {
  if (v.gstin && !v.businessName) ctx.addIssue({ code: "custom", path: ["businessName"], message: "Enter the registered business name for the GST invoice." });
  if (v.businessName && !v.gstin) ctx.addIssue({ code: "custom", path: ["gstin"], message: "Enter the GSTIN, or clear the business name." });
}

export const checkoutSchema = checkoutFields.superRefine(refineCheckout);

export const profileSchema = z.object({
  name: rules.optionalPersonName(),
  phone: rules.optionalMobile(),
});

export const reviewFields = z.object({
  title: rules.optionalText(100, "The headline"),
  body: rules.requiredText("Write a few words about the product.", 10, 2000, "Your review"),
});

export const trackSchema = z.object({
  orderNumber: z.preprocess(
    (v) => String(v ?? "").replace(/\D/g, ""),
    z
      .string()
      .min(1, "Enter your order number.")
      .refine((v) => v.length >= 6 && v.length <= 12, "Order numbers have 6 digits or more, e.g. 100001."),
  ),
  contact: z.preprocess(
    (v) => String(v ?? "").trim(),
    z
      .string()
      .min(1, "Enter the email or mobile number used for the order.")
      .refine((v) => (v.includes("@") ? z.email().safeParse(v).success : normalizeIndianMobile(v) !== null), "Enter a valid email address or 10-digit mobile number."),
  ),
});

export const newsletterSchema = z.object({ email: rules.email() });
export const loginEmailSchema = z.object({ email: rules.email() });
export const loginCodeSchema = z.object({ code: rules.sixDigitCode("Enter the 6-digit code from the email.") });

export const enquirySchema = z.object({
  name: rules.personName("Enter your name."),
  businessName: rules.optionalText(120, "The business name"),
  gstin: rules.gstin(),
  email: rules.email(),
  phone: rules.mobile(),
  city: rules.optionalCity(),
  requirement: rules.requiredText("Tell us which products and roughly how much you need.", 10, 3000, "Your message"),
});

export const couponCodeSchema = z.object({
  code: z.preprocess(
    (v) => String(v ?? "").trim().toUpperCase(),
    z
      .string()
      .min(1, "Enter a discount code.")
      .refine((v) => /^[A-Z0-9_-]{3,30}$/.test(v), "Codes use letters and numbers, like SPICE10."),
  ),
});

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export const staffLoginSchema = z.object({
  email: rules.email(),
  password: z.preprocess((v) => String(v ?? ""), z.string().min(1, "Enter your password.")),
});

export const totpSchema = z.object({ code: rules.sixDigitCode("Enter the 6-digit code from your authenticator app.") });

/** A one-time backup code, e.g. "K7QM-3XPA" (dashes and spaces optional). */
export const backupCodeSchema = z.object({
  code: z.preprocess(
    (v) => (typeof v === "string" ? v : ""),
    z
      .string()
      .trim()
      .min(1, "Enter one of your backup codes.")
      .refine((v) => /^[A-Za-z0-9]{8}$/.test(v.replace(/[\s-]/g, "")), "Backup codes look like K7QM-3XPA (8 letters and numbers)."),
  ),
});

export const staffRole = z.enum(["OWNER", "MANAGER", "PACKER", "ACCOUNTANT"], { message: "Choose a role." });

export const createStaffSchema = z.object({
  name: rules.personName("Enter their name."),
  email: rules.email("Enter their work email."),
  role: staffRole,
});

export const changePasswordSchema = z
  .object({
    current: z.preprocess((v) => String(v ?? ""), z.string().min(1, "Enter your current password.")),
    next: z.preprocess(
      (v) => String(v ?? ""),
      z
        .string()
        .min(1, "Choose a new password.")
        .superRefine((v, ctx) => {
          const problem = passwordProblem(v);
          if (problem) ctx.addIssue({ code: "custom", message: problem });
        }),
    ),
    confirm: z.preprocess((v) => String(v ?? ""), z.string().min(1, "Type the new password again.")),
  })
  .superRefine((v, ctx) => {
    if (v.confirm && v.next !== v.confirm) ctx.addIssue({ code: "custom", path: ["confirm"], message: "This doesn't match the new password." });
    if (v.current && v.next && v.current === v.next) ctx.addIssue({ code: "custom", path: ["next"], message: "Choose a password different from your current one." });
  });

const stateName = (code: string) => INDIAN_STATES.find((s) => s.code === code)?.name;

export const storeSettingsFormSchema = z
  .object({
    tradeName: rules.requiredText("Enter the store name.", 2, 80, "The store name"),
    legalName: rules.optionalText(120, "The legal name"),
    cin: rules.cin(),
    gstin: rules.gstin(),
    fssaiNumber: rules.fssai(),
    addressLine1: rules.optionalText(200, "The address"),
    addressLine2: rules.optionalText(200, "Address line 2"),
    city: rules.optionalCity(),
    state: rules.optionalState(),
    pincode: rules.optionalPincode(),
    supportEmail: rules.optionalEmail(),
    supportPhone: rules.optionalPhone(),
    supportHours: rules.optionalText(80, "Support hours"),
    whatsappNumber: rules.optionalMobile(),
    instagramUrl: rules.httpsUrl("The Instagram link"),
    facebookUrl: rules.httpsUrl("The Facebook link"),
    youtubeUrl: rules.httpsUrl("The YouTube link"),
  })
  .superRefine((v, ctx) => {
    if (v.gstin && v.state && !gstinMatchesState(v.gstin, v.state)) {
      ctx.addIssue({ code: "custom", path: ["gstin"], message: `This GSTIN is registered in ${stateName(v.gstin.slice(0, 2)) ?? "another state"}, but the state below is ${v.state}.` });
    }
    if (v.gstin && !v.legalName) ctx.addIssue({ code: "custom", path: ["legalName"], message: "Enter the legal name registered with this GSTIN." });
    if ((v.addressLine1 || v.pincode) && !(v.addressLine1 && v.pincode && v.city && v.state)) {
      ctx.addIssue({ code: "custom", path: [!v.addressLine1 ? "addressLine1" : !v.city ? "city" : !v.state ? "state" : "pincode"], message: "Complete the registered address (street, city, state and pincode)." });
    }
  });

export const shippingSettingsFormSchema = z
  .object({
    pickupPincode: rules.pincode(),
    courierChoice: z.enum(["CHEAPEST", "FASTEST", "RECOMMENDED"]),
    handlingFee: rules.optionalRupees(),
    packagingWeightGrams: rules.wholeNumber("the box and filler weight", 0, 5000),
    boxLengthCm: rules.wholeNumber("the box length", 1, 200),
    boxBreadthCm: rules.wholeNumber("the box breadth", 1, 200),
    boxHeightCm: rules.wholeNumber("the box height", 1, 200),
    freeShippingOn: checkbox,
    freeShippingThreshold: rules.optionalRupees(),
  })
  .superRefine((v, ctx) => {
    if (v.freeShippingOn && !v.freeShippingThreshold) ctx.addIssue({ code: "custom", path: ["freeShippingThreshold"], message: "Enter the order value for free shipping." });
  });

export const codSettingsFormSchema = z
  .object({
    enabled: checkbox,
    fee: rules.optionalRupees(),
    confirmationHours: rules.wholeNumber("the confirmation time", 1, 168),
    maxOn: checkbox,
    maxOrder: rules.optionalRupees(),
    blockedPincodes: z.preprocess(
      (v) => [...new Set(String(v ?? "").split(/[\s,]+/).filter(Boolean))],
      z.array(z.string()).superRefine((list, ctx) => {
        const bad = list.find((p) => !isValidPincode(p));
        if (bad) ctx.addIssue({ code: "custom", message: `"${bad}" isn't a valid 6-digit pincode.` });
      }),
    ),
  })
  .superRefine((v, ctx) => {
    if (v.maxOn && !v.maxOrder) ctx.addIssue({ code: "custom", path: ["maxOrder"], message: "Enter the largest order total allowed for COD." });
  });

export const checkoutSettingsFormSchema = z.object({ reservationMinutes: rules.wholeNumber("the payment window", 5, 60) });

export const notificationSettingsFormSchema = z.object({
  ownerEmail: rules.optionalEmail(),
  newOrderEmails: checkbox,
  lowStockEmails: checkbox,
  dailySummary: checkbox,
  unpaidReminder: checkbox,
  unpaidReminderHours: rules.wholeNumber("the reminder delay", 1, 24),
  reviewRequests: checkbox,
  reviewRequestDays: rules.wholeNumber("the days after delivery", 1, 30),
});

export const analyticsSettingsFormSchema = z.object({
  gaMeasurementId: z
    .preprocess((v) => String(v ?? "").trim().toUpperCase(), z.string())
    .refine((v) => v === "" || /^G-[A-Z0-9]{4,15}$/.test(v), "A Google Analytics measurement ID looks like G-XXXXXXXXXX."),
});

export const loyaltySettingsFormSchema = z.object({
  pointsEnabled: checkbox,
  pointsPerHundredRupees: rules.wholeNumber("the points per ₹100", 1, 20),
  pointValue: rules.rupees("Enter what one point is worth in rupees.").refine((p) => p >= 10 && p <= 1000, "A point can be worth ₹0.10 to ₹10."),
  maxRedeemPercent: rules.wholeNumber("the most that can be paid with points", 5, 50),
  minPointsToRedeem: rules.wholeNumber("the minimum points to use", 0, 10_000),
  referralsEnabled: checkbox,
  referralDiscountPercent: rules.wholeNumber("the friend's discount", 1, 50),
  referralMaxDiscount: rules.rupees("Enter the largest discount a friend can get."),
  referralRewardPoints: rules.wholeNumber("the referrer's points", 0, 10_000),
});

export const whatsappSettingsFormSchema = z.object({ enabled: checkbox });

export const SETTINGS_FORM_SCHEMAS = {
  store: storeSettingsFormSchema,
  shipping: shippingSettingsFormSchema,
  cod: codSettingsFormSchema,
  checkout: checkoutSettingsFormSchema,
  notifications: notificationSettingsFormSchema,
  analytics: analyticsSettingsFormSchema,
  loyalty: loyaltySettingsFormSchema,
  whatsapp: whatsappSettingsFormSchema,
} as const;

const isoDate = z.preprocess((v) => String(v ?? ""), z.string()).refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Pick a date.");

export const couponFormSchema = z
  .object({
    code: couponCodeSchema.shape.code,
    description: rules.optionalText(200, "The description"),
    type: z.enum(["PERCENT", "FIXED", "FREE_SHIPPING"]),
    value: z.preprocess((v) => String(v ?? "").trim(), z.string()),
    maxDiscount: rules.optionalRupees(),
    minOrder: rules.optionalRupees(),
    scope: z.enum(["ALL", "PRODUCTS", "CATEGORIES"]),
    productIds: z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.coerce.number().int().positive())),
    categoryIds: z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.coerce.number().int().positive())),
    startsOn: isoDate,
    endsOn: isoDate,
    usageLimitTotal: rules.optionalWholeNumber("total uses", 1),
    usageLimitPerCustomer: rules.optionalWholeNumber("uses per customer", 1),
    isActive: checkbox,
    isFeatured: checkbox,
  })
  .superRefine((v, ctx) => {
    if (v.type === "PERCENT") {
      const pct = Number(v.value);
      if (!v.value) ctx.addIssue({ code: "custom", path: ["value"], message: "Enter the percentage off." });
      else if (!/^\d+(\.\d{1,2})?$/.test(v.value) || pct <= 0 || pct > 90) ctx.addIssue({ code: "custom", path: ["value"], message: "Enter a percentage between 1 and 90." });
    }
    if (v.type === "FIXED") {
      const r = rules.rupees("Enter the discount amount in rupees.").safeParse(v.value);
      if (!r.success) ctx.addIssue({ code: "custom", path: ["value"], message: r.error.issues[0].message });
    }
    if (v.scope === "PRODUCTS" && !v.productIds.length) ctx.addIssue({ code: "custom", path: ["productIds"], message: "Choose at least one product." });
    if (v.scope === "CATEGORIES" && !v.categoryIds.length) ctx.addIssue({ code: "custom", path: ["categoryIds"], message: "Choose at least one category." });
    if (v.startsOn && v.endsOn && v.endsOn < v.startsOn) ctx.addIssue({ code: "custom", path: ["endsOn"], message: "The end date must be on or after the start date." });
    if (v.usageLimitTotal && v.usageLimitPerCustomer && v.usageLimitPerCustomer > v.usageLimitTotal) {
      ctx.addIssue({ code: "custom", path: ["usageLimitPerCustomer"], message: "Can't be more than the total uses." });
    }
  });

const poolCode = z.preprocess(
  (v) => String(v ?? "").trim().toUpperCase(),
  z
    .string()
    .min(1, "Enter a short code for this stock pool.")
    .refine((v) => /^[A-Z0-9._-]{2,40}$/.test(v), "Use 2–40 letters, numbers, dot, dash or underscore, e.g. CUMIN-PWD-BULK."),
);

export const newPoolSchema = z.object({
  name: rules.requiredText("Name the stock pool, e.g. “Cumin powder, loose”.", 2, 120, "The name"),
  sku: poolCode,
  openingKg: rules.decimal("the opening stock in kg", { min: 0, max: 100_000, allowEmpty: true }),
  thresholdKg: rules.decimal("the alert level in kg", { min: 0, max: 100_000, allowEmpty: true }),
  costPerKg: rules.optionalRupees(),
});

export const adjustStockSchema = z
  .object({
    kind: z.enum(["RESTOCK", "ADJUSTMENT"]),
    quantity: rules.decimal("the quantity", { positive: true, max: 1_000_000 }),
    note: rules.optionalText(300, "The note"),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "ADJUSTMENT" && !v.note) ctx.addIssue({ code: "custom", path: ["note"], message: "Say why you're correcting stock, e.g. 2 pouches torn." });
  });

export const poolSettingsSchema = z.object({
  name: rules.requiredText("Enter a name.", 2, 120, "The name"),
  threshold: rules.decimal("the alert level", { min: 0, max: 1_000_000 }),
  cost: rules.optionalRupees(),
});

export const newProductSchema = z.object({
  name: rules.requiredText("Enter a product name.", 2, 120, "The name"),
});

export const productDetailsSchema = z.object({
  name: rules.requiredText("Enter a product name.", 2, 120, "The name"),
  slug: z
    .preprocess((v) => String(v ?? "").trim().toLowerCase(), z.string().max(80, "Keep the web address under 80 characters."))
    .refine((v) => v === "" || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v), "Use lower-case letters, numbers and single dashes, e.g. turmeric-powder."),
  subtitle: rules.optionalText(160, "The subtitle"),
  description: rules.optionalText(5000, "The description"),
  categoryId: z.coerce.number().int().positive().nullable().catch(null),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
  tags: rules.optionalText(500, "Tags"),
  ingredients: rules.optionalText(1000, "Ingredients"),
  usageInstructions: rules.optionalText(2000, "How to use"),
  storageInstructions: rules.optionalText(1000, "Storage"),
  shelfLife: rules.optionalText(200, "Shelf life"),
  countryOfOrigin: z.preprocess((v) => String(v ?? "").trim() || "India", z.string().max(80, "Keep this under 80 characters.")),
  netUnit: z.enum(["g", "ml"]).catch("g"),
  allergenInfo: rules.optionalText(500, "Allergen information"),
  nutritionInfo: rules.optionalText(2000, "Nutrition information"),
  isFeatured: checkbox,
  seoTitle: rules.optionalText(120, "The search title"),
  seoDescription: rules.optionalText(300, "The search description"),
  // Hindi shop (/hi). Empty fields show the English.
  nameHi: rules.optionalText(120, "The Hindi name"),
  subtitleHi: rules.optionalText(160, "The Hindi subtitle"),
  descriptionHi: rules.optionalText(5000, "The Hindi description"),
  ingredientsHi: rules.optionalText(1000, "Hindi ingredients"),
  usageInstructionsHi: rules.optionalText(2000, "Hindi how to use"),
  storageInstructionsHi: rules.optionalText(1000, "Hindi storage"),
  collectionIds: z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.coerce.number().int().positive())),
});
export type ProductDetailsInput = z.infer<typeof productDetailsSchema>;

export const groupFormSchema = z.object({
  name: rules.requiredText("Enter a name.", 2, 80, "The name"),
  slug: productDetailsSchema.shape.slug,
  description: rules.optionalText(500, "The description"),
  nameHi: rules.optionalText(80, "The Hindi name"),
  descriptionHi: rules.optionalText(500, "The Hindi description"),
  sortOrder: rules.optionalWholeNumber("the sort order", 0, 1000),
  /** Collections only: show as a filter button on this category's page. */
  categoryId: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().positive().nullable()).optional(),
});

const ACCEPTED_IMAGES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Browser-side check before uploading (the server re-checks every file). */
export const imageUploadSchema = z.object({
  images: z
    .array(z.custom<File>((f) => typeof File !== "undefined" && f instanceof File))
    .min(1, "Choose one or more images.")
    .max(10, "Upload up to 10 images at a time.")
    .superRefine((files, ctx) => {
      const wrong = files.find((f) => !ACCEPTED_IMAGES.includes(f.type));
      if (wrong) ctx.addIssue({ code: "custom", message: `“${wrong.name}” isn't a JPEG, PNG, WebP or AVIF image.` });
      const big = files.find((f) => f.size > MAX_IMAGE_BYTES);
      if (big) ctx.addIssue({ code: "custom", message: `“${big.name}” is over 8 MB. Resize it and try again.` });
    }),
  alt: rules.optionalText(200, "The description"),
});

export const csvUploadSchema = z.object({
  file: z
    .custom<File | null>((f) => f === null || (typeof File !== "undefined" && f instanceof File))
    .refine((f) => !!f && f.size > 0, "Choose the CSV file to import.")
    .refine((f) => !f || /\.csv$/i.test(f.name) || f.type === "text/csv", "Choose a .csv file (Netlify's “Download as CSV”).")
    .refine((f) => !f || f.size <= 2_000_000, "That file is too large (2 MB maximum)."),
});

export const enquiryUpdateSchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "CLOSED"], { message: "Choose a status." }),
  staffNote: rules.optionalText(2000, "The note"),
});

/** Admin refund. The server re-checks the amount against what's still refundable. */
export const refundFormSchema = (maxPaise: number) =>
  z
    .object({
      amount: rules.rupees("Enter the refund amount.").refine((p) => p <= maxPaise, `You can refund at most ₹${(maxPaise / 100).toFixed(2)}.`),
      mode: z.enum(["RAZORPAY", "MANUAL"]),
      reason: rules.requiredText("Give a reason for the refund (it goes on the credit note).", 3, 200, "The reason"),
      reference: rules.optionalText(100, "The reference"),
    })
    .superRefine((v, ctx) => {
      if (v.mode === "MANUAL" && !v.reference) ctx.addIssue({ code: "custom", path: ["reference"], message: "Enter the UPI or bank reference of the money you sent." });
    });

export const cancelReasonSchema = z.object({ reason: rules.requiredText("Give a reason (it's shown to the customer).", 3, 200, "The reason") });

export const manualShipSchema = z.object({
  courierName: rules.requiredText("Enter the courier or how it was sent.", 2, 80, "The courier name"),
  awb: rules.optionalText(60, "The tracking number"),
  trackingUrl: rules.httpsUrl("The tracking link"),
});

export const orderNoteSchema = z.object({ note: rules.requiredText("Write a note first.", 1, 1000, "The note") });

export const stockAlertSchema = z.object({ email: rules.email(), variantId: z.coerce.number().int().positive() });

export const pointsAdjustSchema = z.object({
  points: z.preprocess(
    (v) => String(v ?? "").trim(),
    z
      .string()
      .min(1, "Enter the points to add, or a minus number to remove.")
      .refine((v) => /^-?\d{1,6}$/.test(v) && Number(v) !== 0, "Enter a whole number, like 50 or -20.")
      .transform(Number),
  ),
  note: rules.requiredText("Say why (the customer sees this).", 3, 200, "The reason"),
});

export const recipeSchema = z
  .object({
    title: rules.requiredText("Give the recipe a title.", 3, 120, "The title"),
    slug: productDetailsSchema.shape.slug,
    summary: rules.optionalText(300, "The summary"),
    prepMinutes: rules.optionalWholeNumber("the prep time in minutes", 0, 1440),
    cookMinutes: rules.optionalWholeNumber("the cooking time in minutes", 0, 1440),
    serves: rules.optionalWholeNumber("the number of servings", 1, 50),
    ingredients: rules.optionalText(5000, "Ingredients"),
    method: rules.optionalText(10_000, "The method"),
    // Hindi shop (/hi). Empty fields show the English.
    titleHi: rules.optionalText(120, "The Hindi title"),
    summaryHi: rules.optionalText(300, "The Hindi summary"),
    ingredientsHi: rules.optionalText(5000, "Hindi ingredients"),
    methodHi: rules.optionalText(10_000, "The Hindi method"),
    productIds: z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.coerce.number().int().positive())),
    status: z.enum(["DRAFT", "PUBLISHED"]),
  })
  .superRefine((v, ctx) => {
    if (v.status !== "PUBLISHED") return;
    if (!v.ingredients) ctx.addIssue({ code: "custom", path: ["ingredients"], message: "Add the ingredients before publishing (one per line)." });
    if (!v.method) ctx.addIssue({ code: "custom", path: ["method"], message: "Add the method before publishing (one step per line)." });
  });

/* ------------------------------------------------------------------ */
/* Problems with delivered orders                                      */
/* ------------------------------------------------------------------ */

export const PROBLEM_KINDS = ["DAMAGED", "WRONG_ITEM", "EXPIRED", "MISSING", "OTHER"] as const;
export const MAX_PROBLEM_PHOTOS = 4;

const idList = z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.coerce.number().int().positive()));

/** The customer's report. Photos are checked separately (they're files, resized in the browser first). */
export const problemReportSchema = z.object({
  items: idList.pipe(z.array(z.number()).min(1, "Tick the item (or items) with the problem.")),
  kind: z.enum(PROBLEM_KINDS, { message: "Choose what went wrong." }),
  description: rules.requiredText("Tell us what happened.", 10, 1000, "The description"),
});

/** Staff: send a free replacement. Quantities are per order line (qty-<orderItemId>). */
export const problemReplacementSchema = z.object({
  note: rules.requiredText("Write a short note for the customer.", 3, 300, "The note"),
});

export const problemCloseSchema = z.object({
  note: rules.requiredText("Tell the customer why (they'll get this by email).", 3, 500, "The message"),
});

/* ------------------------------------------------------------------ */
/* Scheduled sales                                                     */
/* ------------------------------------------------------------------ */

/** "2026-11-01T09:00" from a datetime-local field, read as India time. */
export function istDateTime(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dateTime = (empty: string) => z.preprocess((v) => String(v ?? ""), z.string().min(1, empty).refine((v) => istDateTime(v) !== null, "Pick a date and time."));

export const saleFormSchema = z
  .object({
    name: rules.requiredText("Give the sale a name customers will see, like Diwali sale.", 3, 40, "The name"),
    percent: z.preprocess(
      (v) => String(v ?? "").trim(),
      z
        .string()
        .min(1, "Enter the percentage off.")
        .refine((v) => /^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 90, "Enter a whole number from 1 to 90.")
        .transform(Number),
    ),
    startsAt: dateTime("Choose when the sale starts."),
    endsAt: dateTime("Choose when the sale ends."),
    scope: z.enum(["ALL", "PRODUCTS", "CATEGORIES"]),
    productIds: z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.coerce.number().int().positive())),
    categoryIds: z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.coerce.number().int().positive())),
    isActive: checkbox,
  })
  .superRefine((v, ctx) => {
    const start = istDateTime(v.startsAt);
    const end = istDateTime(v.endsAt);
    if (start && end && end <= start) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The sale must end after it starts." });
    if (v.scope === "PRODUCTS" && !v.productIds.length) ctx.addIssue({ code: "custom", path: ["productIds"], message: "Choose at least one product." });
    if (v.scope === "CATEGORIES" && !v.categoryIds.length) ctx.addIssue({ code: "custom", path: ["categoryIds"], message: "Choose at least one category." });
  });
