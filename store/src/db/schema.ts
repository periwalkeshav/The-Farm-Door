/**
 * Database schema for The Farm Door.
 *
 * Conventions
 * - Money is stored as integer paise (₹1 = 100 paise). Never floats.
 * - GST rates are stored in basis points (5% = 500).
 * - Selling prices and MRP are GST-inclusive, as displayed to customers.
 * - Column names are snake_case in Postgres; Drizzle maps them from camelCase
 *   (see `casing: "snake_case"` in src/db/index.ts and drizzle.config.ts).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const id = () => integer().primaryKey().generatedAlwaysAsIdentity();

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const productStatus = pgEnum("product_status", ["DRAFT", "ACTIVE", "ARCHIVED"]);
export const stockUnit = pgEnum("stock_unit", ["PACK", "GRAM"]);
export const stockMovementReason = pgEnum("stock_movement_reason", [
  "RESERVE", // held for an order awaiting payment / COD confirmation
  "RELEASE", // hold released (payment expired, order cancelled before confirmation)
  "SALE", // order confirmed: on-hand reduced, hold cleared
  "RESTOCK", // goods received
  "ADJUSTMENT", // manual correction (damage, count difference, ...)
  "RETURN", // goods back in stock after cancellation / return to origin
]);
export const staffRole = pgEnum("staff_role", ["OWNER", "MANAGER", "PACKER", "ACCOUNTANT"]);
export const sessionSubject = pgEnum("session_subject", ["CUSTOMER", "STAFF"]);
export const orderStatus = pgEnum("order_status", [
  "AWAITING_PAYMENT",
  "AWAITING_COD_CONFIRMATION",
  "CONFIRMED",
  "PACKED",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "RETURNED_TO_ORIGIN",
  "CANCELLED",
]);
export const paymentMethod = pgEnum("payment_method", ["PREPAID", "COD"]);
export const orderPaymentStatus = pgEnum("order_payment_status", [
  "PENDING", // prepaid, not yet paid
  "PAID",
  "FAILED", // never paid (payment window expired)
  "COD_PENDING", // cash to be collected on delivery
  "COD_COLLECTED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "NOT_APPLICABLE", // cancelled COD order before delivery
]);
export const stockState = pgEnum("stock_state", [
  "NONE",
  "RESERVED",
  "COMMITTED",
  "RELEASED",
  "RETURNED",
]);
export const paymentRecordStatus = pgEnum("payment_record_status", [
  "CREATED",
  "AUTHORIZED",
  "CAPTURED",
  "FAILED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]);
export const refundStatus = pgEnum("refund_status", ["PENDING", "PROCESSED", "FAILED"]);
export const refundMode = pgEnum("refund_mode", ["RAZORPAY", "MANUAL"]);
export const couponType = pgEnum("coupon_type", ["PERCENT", "FIXED", "FREE_SHIPPING"]);
export const couponScope = pgEnum("coupon_scope", ["ALL", "PRODUCTS", "CATEGORIES"]);
export const reviewStatus = pgEnum("review_status", ["PENDING", "APPROVED", "REJECTED"]);
export const shipmentStatus = pgEnum("shipment_status", [
  "CREATED",
  "PICKUP_SCHEDULED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "RTO_INITIATED",
  "RTO_DELIVERED",
  "CANCELLED",
]);

/* ------------------------------------------------------------------ */
/* Settings & media                                                    */
/* ------------------------------------------------------------------ */

export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: updatedAt(),
});

/** Uploaded images, stored in Postgres (small catalogue; keeps hosting to one service). */
export const media = pgTable("media", {
  id: id(),
  sha256: text().notNull().unique(),
  mime: text().notNull(),
  width: integer().notNull(),
  height: integer().notNull(),
  full: bytea().notNull(),
  thumb: bytea().notNull(),
  alt: text().notNull().default(""),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

export const categories = pgTable("categories", {
  id: id(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text().notNull().default(""),
  imageId: integer().references(() => media.id, { onDelete: "set null" }),
  sortOrder: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const collections = pgTable("collections", {
  id: id(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text().notNull().default(""),
  showOnHome: boolean().notNull().default(false),
  sortOrder: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const products = pgTable(
  "products",
  {
    id: id(),
    slug: text().notNull().unique(),
    name: text().notNull(),
    subtitle: text().notNull().default(""),
    description: text().notNull().default(""),
    categoryId: integer().references(() => categories.id, { onDelete: "set null" }),
    status: productStatus().notNull().default("DRAFT"),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    ingredients: text().notNull().default(""),
    usageInstructions: text().notNull().default(""),
    storageInstructions: text().notNull().default(""),
    shelfLife: text().notNull().default(""),
    countryOfOrigin: text().notNull().default("India"),
    allergenInfo: text().notNull().default(""),
    nutritionInfo: text().notNull().default(""),
    /** Options offered, in display order, e.g. [{name:"Form", values:["Whole","Powder"]}, {name:"Size", ...}] */
    options: jsonb().$type<ProductOption[]>().notNull().default([]),
    isFeatured: boolean().notNull().default(false),
    seoTitle: text().notNull().default(""),
    seoDescription: text().notNull().default(""),
    publishedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("products_category_idx").on(t.categoryId), index("products_status_idx").on(t.status)],
);

export type ProductOption = { name: string; values: string[] };

export const collectionProducts = pgTable(
  "collection_products",
  {
    collectionId: integer()
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    productId: integer()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.productId] })],
);

export const productImages = pgTable(
  "product_images",
  {
    id: id(),
    productId: integer()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    mediaId: integer()
      .notNull()
      .references(() => media.id, { onDelete: "restrict" }),
    alt: text().notNull().default(""),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [index("product_images_product_idx").on(t.productId)],
);

/**
 * A stock pool. PACK pools count ready-packed units; GRAM pools hold loose
 * stock (in grams) that several pack sizes draw from.
 */
export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: id(),
    name: text().notNull(),
    sku: text().notNull().unique(),
    unit: stockUnit().notNull(),
    onHand: integer().notNull().default(0),
    reserved: integer().notNull().default(0),
    lowStockThreshold: integer().notNull().default(0),
    /** Cost per pack (PACK) or per kilogram (GRAM), in paise. Optional; used for margin reports. */
    unitCostPaise: integer(),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("inventory_on_hand_nonneg", sql`${t.onHand} >= 0`),
    check("inventory_reserved_nonneg", sql`${t.reserved} >= 0`),
    check("inventory_reserved_le_on_hand", sql`${t.reserved} <= ${t.onHand}`),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    productId: integer()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text().notNull().unique(),
    /** Option values, keyed by option name: {"Form":"Powder","Size":"250 g"} */
    optionValues: jsonb().$type<Record<string, string>>().notNull().default({}),
    pricePaise: integer().notNull(),
    mrpPaise: integer().notNull(),
    /** Net contents in grams, used for "price per 100 g" and bulk stock deduction. */
    netWeightGrams: integer().notNull(),
    /** Weight of the packed unit including packaging, used for courier rates. */
    shippingWeightGrams: integer().notNull(),
    hsnCode: text().notNull(),
    gstRateBp: integer().notNull(),
    inventoryItemId: integer()
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    /** Units taken from the stock pool per item sold: 1 for PACK pools, net grams for GRAM pools. */
    unitsPerSale: integer().notNull().default(1),
    shelfLifeOverride: text().notNull().default(""),
    isActive: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("variants_product_idx").on(t.productId),
    check("variant_price_positive", sql`${t.pricePaise} > 0`),
    check("variant_price_le_mrp", sql`${t.pricePaise} <= ${t.mrpPaise}`),
    check("variant_units_positive", sql`${t.unitsPerSale} > 0`),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: id(),
    inventoryItemId: integer()
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    reason: stockMovementReason().notNull(),
    changeOnHand: integer().notNull().default(0),
    changeReserved: integer().notNull().default(0),
    onHandAfter: integer().notNull(),
    reservedAfter: integer().notNull(),
    orderId: integer(),
    staffUserId: integer(),
    note: text().notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    index("stock_movements_item_idx").on(t.inventoryItemId, t.createdAt),
    index("stock_movements_order_idx").on(t.orderId),
  ],
);

/* ------------------------------------------------------------------ */
/* People & auth                                                       */
/* ------------------------------------------------------------------ */

export const customers = pgTable("customers", {
  id: id(),
  email: text().notNull().unique(), // stored lower-cased
  name: text().notNull().default(""),
  phone: text().notNull().default(""),
  googleSub: text().unique(),
  marketingOptIn: boolean().notNull().default(false),
  marketingOptInAt: timestamp({ withTimezone: true }),
  lastLoginAt: timestamp({ withTimezone: true }),
  deletionRequestedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const addresses = pgTable(
  "addresses",
  {
    id: id(),
    customerId: integer()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    name: text().notNull(),
    phone: text().notNull(),
    line1: text().notNull(),
    line2: text().notNull().default(""),
    landmark: text().notNull().default(""),
    city: text().notNull(),
    state: text().notNull(),
    pincode: text().notNull(),
    isDefault: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("addresses_customer_idx").on(t.customerId)],
);

export const staffUsers = pgTable("staff_users", {
  id: id(),
  email: text().notNull().unique(),
  name: text().notNull(),
  passwordHash: text().notNull(),
  role: staffRole().notNull(),
  totpSecretEnc: text(),
  totpEnabled: boolean().notNull().default(false),
  isActive: boolean().notNull().default(true),
  failedLogins: integer().notNull().default(0),
  lockedUntil: timestamp({ withTimezone: true }),
  lastLoginAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the session token; the token itself only lives in the cookie. */
    id: text().primaryKey(),
    subject: sessionSubject().notNull(),
    subjectId: integer().notNull(),
    /** Staff only: password verified but second factor still pending. */
    mfaPending: boolean().notNull().default(false),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ip: text().notNull().default(""),
    userAgent: text().notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_subject_idx").on(t.subject, t.subjectId)],
);

export const loginCodes = pgTable(
  "login_codes",
  {
    id: id(),
    email: text().notNull(),
    codeHash: text().notNull(),
    attempts: integer().notNull().default(0),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    consumedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("login_codes_email_idx").on(t.email, t.createdAt)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text().primaryKey(),
  windowStart: timestamp({ withTimezone: true }).notNull(),
  count: integer().notNull(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    staffUserId: integer().references(() => staffUsers.id, { onDelete: "set null" }),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text().notNull().default(""),
    data: jsonb().notNull().default({}),
    ip: text().notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Cart                                                                */
/* ------------------------------------------------------------------ */

export const carts = pgTable("carts", {
  id: uuid().primaryKey().defaultRandom(),
  customerId: integer().references(() => customers.id, { onDelete: "set null" }),
  couponCode: text(),
  pincode: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const cartItems = pgTable(
  "cart_items",
  {
    cartId: uuid()
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: integer()
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer().notNull(),
    addedAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.cartId, t.variantId] }),
    check("cart_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

/* ------------------------------------------------------------------ */
/* Coupons                                                             */
/* ------------------------------------------------------------------ */

export const coupons = pgTable("coupons", {
  id: id(),
  code: text().notNull().unique(), // upper-case
  description: text().notNull().default(""),
  type: couponType().notNull(),
  /** Basis points for PERCENT, paise for FIXED, unused for FREE_SHIPPING. */
  value: integer().notNull().default(0),
  maxDiscountPaise: integer(),
  minOrderPaise: integer().notNull().default(0),
  scope: couponScope().notNull().default("ALL"),
  productIds: integer().array().notNull().default(sql`'{}'::integer[]`),
  categoryIds: integer().array().notNull().default(sql`'{}'::integer[]`),
  startsAt: timestamp({ withTimezone: true }),
  endsAt: timestamp({ withTimezone: true }),
  usageLimitTotal: integer(),
  usageLimitPerCustomer: integer(),
  timesUsed: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export type ShippingQuoteSnapshot = {
  provider: string;
  courierId: string;
  courierName: string;
  chargePaise: number; // what the customer pays (0 when free shipping applies)
  quotedCostPaise: number; // courier's quoted cost to us
  etaDays: number | null;
  etaDate: string | null; // ISO date from courier, if provided
  quotedAt: string;
};

export const orders = pgTable(
  "orders",
  {
    id: id(),
    orderNumber: text().notNull().unique(),
    /** Random token letting a guest view this order (sent in emails). Stored hashed. */
    accessTokenHash: text().notNull(),
    idempotencyKey: text().notNull().unique(),
    customerId: integer().references(() => customers.id, { onDelete: "set null" }),
    email: text().notNull(),
    phone: text().notNull(),
    status: orderStatus().notNull(),
    paymentMethod: paymentMethod().notNull(),
    paymentStatus: orderPaymentStatus().notNull(),
    stockState: stockState().notNull().default("NONE"),

    shipName: text().notNull(),
    shipPhone: text().notNull(),
    shipLine1: text().notNull(),
    shipLine2: text().notNull().default(""),
    shipLandmark: text().notNull().default(""),
    shipCity: text().notNull(),
    shipState: text().notNull(),
    shipPincode: text().notNull(),

    billingGstin: text().notNull().default(""),
    billingBusinessName: text().notNull().default(""),

    subtotalPaise: integer().notNull(), // items at selling price, before coupon
    discountPaise: integer().notNull().default(0),
    shippingPaise: integer().notNull().default(0),
    codFeePaise: integer().notNull().default(0),
    totalPaise: integer().notNull(),
    taxPaise: integer().notNull().default(0), // GST included in total
    couponId: integer().references(() => coupons.id, { onDelete: "set null" }),
    couponCode: text(),
    shippingQuote: jsonb().$type<ShippingQuoteSnapshot>(),
    totalWeightGrams: integer().notNull().default(0),

    razorpayOrderId: text().unique(),
    reservationExpiresAt: timestamp({ withTimezone: true }),
    codConfirmTokenHash: text(),
    customerNote: text().notNull().default(""),
    cancelReason: text().notNull().default(""),
    marketingOptIn: boolean().notNull().default(false),

    placedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp({ withTimezone: true }),
    packedAt: timestamp({ withTimezone: true }),
    shippedAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("orders_status_idx").on(t.status),
    index("orders_customer_idx").on(t.customerId),
    index("orders_email_idx").on(t.email),
    index("orders_confirmed_idx").on(t.confirmedAt),
    index("orders_reservation_idx").on(t.reservationExpiresAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    orderId: integer()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer().references(() => products.id, { onDelete: "set null" }),
    variantId: integer().references(() => productVariants.id, { onDelete: "set null" }),
    inventoryItemId: integer().notNull(),
    unitsPerSale: integer().notNull(),
    productName: text().notNull(),
    variantTitle: text().notNull(),
    sku: text().notNull(),
    hsnCode: text().notNull(),
    gstRateBp: integer().notNull(),
    unitPricePaise: integer().notNull(),
    mrpPaise: integer().notNull(),
    quantity: integer().notNull(),
    lineSubtotalPaise: integer().notNull(),
    discountPaise: integer().notNull().default(0),
    lineTotalPaise: integer().notNull(),
    taxableValuePaise: integer().notNull(),
    taxPaise: integer().notNull(),
    /** Cost of goods for this line at the time of sale (paise), if known. */
    costPaise: integer(),
    categoryId: integer(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId), index("order_items_product_idx").on(t.productId)],
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: id(),
    orderId: integer()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    type: text().notNull(),
    message: text().notNull(),
    /** Visible to the customer on their order page. */
    isPublic: boolean().notNull().default(false),
    actor: text().notNull().default("system"), // "system" | "customer" | "staff:<id>" | "courier" | "razorpay"
    data: jsonb().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: id(),
    couponId: integer()
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    orderId: integer()
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: "cascade" }),
    email: text().notNull(),
    discountPaise: integer().notNull(),
    /** False once the order is cancelled before confirmation, so the use is given back. */
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("coupon_redemptions_coupon_email_idx").on(t.couponId, t.email)],
);

/* ------------------------------------------------------------------ */
/* Payments & refunds                                                  */
/* ------------------------------------------------------------------ */

export const payments = pgTable(
  "payments",
  {
    id: id(),
    orderId: integer()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text().notNull().default("RAZORPAY"),
    providerOrderId: text().notNull(),
    providerPaymentId: text().notNull().unique(),
    amountPaise: integer().notNull(),
    status: paymentRecordStatus().notNull(),
    method: text().notNull().default(""),
    feePaise: integer(),
    taxOnFeePaise: integer(),
    errorCode: text().notNull().default(""),
    errorDescription: text().notNull().default(""),
    /** True when this payment arrived after the order was already paid (refunded automatically). */
    isDuplicate: boolean().notNull().default(false),
    raw: jsonb().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("payments_order_idx").on(t.orderId)],
);

export const refunds = pgTable(
  "refunds",
  {
    id: id(),
    orderId: integer()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    paymentId: integer().references(() => payments.id, { onDelete: "set null" }),
    mode: refundMode().notNull(),
    providerRefundId: text().unique(),
    amountPaise: integer().notNull(),
    status: refundStatus().notNull(),
    reason: text().notNull().default(""),
    /** UPI / bank reference for manual (COD) refunds. */
    reference: text().notNull().default(""),
    createdByStaffId: integer().references(() => staffUsers.id, { onDelete: "set null" }),
    processedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("refunds_order_idx").on(t.orderId)],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: id(),
    provider: text().notNull(),
    eventId: text().notNull(),
    eventType: text().notNull(),
    payload: jsonb().notNull(),
    processedAt: timestamp({ withTimezone: true }),
    error: text().notNull().default(""),
    receivedAt: createdAt(),
  },
  (t) => [uniqueIndex("webhook_events_provider_event_idx").on(t.provider, t.eventId)],
);

/* ------------------------------------------------------------------ */
/* Shipping                                                            */
/* ------------------------------------------------------------------ */

export const shipments = pgTable(
  "shipments",
  {
    id: id(),
    orderId: integer()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text().notNull(),
    providerOrderId: text().notNull().default(""),
    providerShipmentId: text().notNull().default(""),
    awb: text(),
    courierName: text().notNull().default(""),
    status: shipmentStatus().notNull().default("CREATED"),
    labelUrl: text().notNull().default(""),
    trackingUrl: text().notNull().default(""),
    /** What the courier actually charged us (paise), when known. */
    costPaise: integer(),
    etaDate: text(),
    isActive: boolean().notNull().default(true),
    lastSyncedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("shipments_order_idx").on(t.orderId), uniqueIndex("shipments_awb_idx").on(t.awb)],
);

export const shipmentEvents = pgTable(
  "shipment_events",
  {
    id: id(),
    shipmentId: integer()
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    status: text().notNull(),
    description: text().notNull().default(""),
    location: text().notNull().default(""),
    occurredAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("shipment_events_shipment_idx").on(t.shipmentId, t.occurredAt),
    uniqueIndex("shipment_events_dedupe_idx").on(t.shipmentId, t.status, t.occurredAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Invoices                                                            */
/* ------------------------------------------------------------------ */

export const counters = pgTable("counters", {
  key: text().primaryKey(),
  value: integer().notNull(),
});

export type InvoiceSnapshot = {
  seller: {
    legalName: string;
    tradeName: string;
    gstin: string;
    address: string;
    state: string;
    stateCode: string;
    fssaiNumber: string;
  };
  buyer: {
    name: string;
    businessName: string;
    gstin: string;
    address: string;
    state: string;
    stateCode: string;
  };
  placeOfSupply: string;
  intraState: boolean;
  lines: InvoiceLine[];
  totals: {
    taxableValuePaise: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
    totalPaise: number;
  };
};

export type InvoiceLine = {
  description: string;
  hsnCode: string;
  quantity: number;
  unitPricePaise: number;
  discountPaise: number;
  taxableValuePaise: number;
  gstRateBp: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
};

export const invoices = pgTable("invoices", {
  id: id(),
  orderId: integer()
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: "restrict" }),
  invoiceNumber: text().notNull().unique(),
  financialYear: text().notNull(),
  isB2b: boolean().notNull().default(false),
  snapshot: jsonb().$type<InvoiceSnapshot>().notNull(),
  issuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const creditNotes = pgTable("credit_notes", {
  id: id(),
  invoiceId: integer()
    .notNull()
    .references(() => invoices.id, { onDelete: "restrict" }),
  refundId: integer().references(() => refunds.id, { onDelete: "set null" }),
  noteNumber: text().notNull().unique(),
  financialYear: text().notNull(),
  amountPaise: integer().notNull(),
  snapshot: jsonb().$type<InvoiceSnapshot>().notNull(),
  issuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Reviews, newsletter, email log                                      */
/* ------------------------------------------------------------------ */

export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    productId: integer()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    customerId: integer()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    orderId: integer().references(() => orders.id, { onDelete: "set null" }),
    rating: integer().notNull(),
    title: text().notNull().default(""),
    body: text().notNull().default(""),
    authorName: text().notNull(),
    status: reviewStatus().notNull().default("PENDING"),
    moderatedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("reviews_product_customer_idx").on(t.productId, t.customerId),
    check("reviews_rating_range", sql`${t.rating} between 1 and 5`),
  ],
);

export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  email: text().primaryKey(),
  source: text().notNull(),
  consentedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  unsubscribedAt: timestamp({ withTimezone: true }),
});

export const emailLog = pgTable(
  "email_log",
  {
    id: id(),
    to: text().notNull(),
    subject: text().notNull(),
    template: text().notNull(),
    status: text().notNull(), // SENT | FAILED | LOGGED (development transport)
    html: text().notNull().default(""),
    error: text().notNull().default(""),
    orderId: integer(),
    createdAt: createdAt(),
  },
  (t) => [index("email_log_created_idx").on(t.createdAt)],
);
