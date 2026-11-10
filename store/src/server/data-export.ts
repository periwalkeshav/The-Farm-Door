/**
 * "Download my data": everything the shop holds about a signed-in customer,
 * as one JSON file they can keep or read. It covers the profile, addresses,
 * orders (including guest orders placed with the same email), reviews, saved
 * products, points, email preferences, reminders, problem reports and
 * enquiries. Internal staff notes and cost prices aren't included; photos sent
 * with problem reports are listed but not attached.
 */
import { and, asc, eq, gt, inArray, or } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import {
  addresses,
  coupons,
  customers,
  emailOptOuts,
  enquiries,
  invoices,
  loyaltyLedger,
  newsletterSubscribers,
  orderEvents,
  orderItems,
  orders,
  problemPhotos,
  problemReports,
  products,
  productVariants,
  refillReminders,
  reviews,
  sessions,
  stockAlerts,
  wishlistItems,
} from "@/db/schema";
import { POINT_REASONS } from "./loyalty";
import { PAYMENT_STATUS_LABELS, STATUS_LABELS, formatAddress } from "./orders/common";
import { PROBLEM_KIND_LABELS, PROBLEM_STATUS_LABELS } from "./problems";

const rupees = (paise: number) => Math.round(paise) / 100;

export async function customerDataExport(db: DbOrTx, customerId: number) {
  const [me] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!me) return null;

  const myOrders = await db
    .select()
    .from(orders)
    .where(or(eq(orders.customerId, me.id), eq(orders.email, me.email)))
    .orderBy(asc(orders.placedAt));
  const orderIds = myOrders.map((o) => o.id);
  const none = [-1];

  const [addressRows, items, events, invoiceRows, reviewRows, saved, points, referral, newsletter, optOut, alerts, refills, reports, photos, enquiryRows, devices] = await Promise.all([
    db.select().from(addresses).where(eq(addresses.customerId, me.id)).orderBy(asc(addresses.createdAt)),
    db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds.length ? orderIds : none)).orderBy(asc(orderItems.id)),
    db
      .select()
      .from(orderEvents)
      .where(and(inArray(orderEvents.orderId, orderIds.length ? orderIds : none), eq(orderEvents.isPublic, true)))
      .orderBy(asc(orderEvents.createdAt)),
    db.select({ orderId: invoices.orderId, invoiceNumber: invoices.invoiceNumber, issuedAt: invoices.issuedAt }).from(invoices).where(inArray(invoices.orderId, orderIds.length ? orderIds : none)),
    db.select({ product: products.name, rating: reviews.rating, title: reviews.title, body: reviews.body, shownAs: reviews.authorName, status: reviews.status, createdAt: reviews.createdAt }).from(reviews).innerJoin(products, eq(products.id, reviews.productId)).where(eq(reviews.customerId, me.id)),
    db.select({ product: products.name, savedAt: wishlistItems.createdAt }).from(wishlistItems).innerJoin(products, eq(products.id, wishlistItems.productId)).where(eq(wishlistItems.customerId, me.id)),
    db.select().from(loyaltyLedger).where(eq(loyaltyLedger.customerId, me.id)).orderBy(asc(loyaltyLedger.createdAt)),
    db.select({ code: coupons.code }).from(coupons).where(eq(coupons.referrerCustomerId, me.id)),
    db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.email, me.email)),
    db.select().from(emailOptOuts).where(eq(emailOptOuts.email, me.email)),
    db
      .select({ product: products.name, options: productVariants.optionValues, requestedAt: stockAlerts.createdAt, emailedAt: stockAlerts.notifiedAt })
      .from(stockAlerts)
      .innerJoin(productVariants, eq(productVariants.id, stockAlerts.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(stockAlerts.email, me.email)),
    db.select().from(refillReminders).where(or(eq(refillReminders.email, me.email), inArray(refillReminders.orderId, orderIds.length ? orderIds : none))),
    db.select().from(problemReports).where(inArray(problemReports.orderId, orderIds.length ? orderIds : none)).orderBy(asc(problemReports.createdAt)),
    db.select({ reportId: problemPhotos.reportId, id: problemPhotos.id }).from(problemPhotos).innerJoin(problemReports, eq(problemReports.id, problemPhotos.reportId)).where(inArray(problemReports.orderId, orderIds.length ? orderIds : none)),
    db.select().from(enquiries).where(eq(enquiries.email, me.email)).orderBy(asc(enquiries.createdAt)),
    db
      .select({ signedInAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, expiresAt: sessions.expiresAt, ip: sessions.ip, device: sessions.userAgent })
      .from(sessions)
      .where(and(eq(sessions.subject, "CUSTOMER"), eq(sessions.subjectId, me.id), gt(sessions.expiresAt, new Date()))),
  ]);
  const orderNumber = new Map(myOrders.map((o) => [o.id, o.orderNumber]));

  return {
    about:
      "Everything The Farm Door holds about you, as of the date below. Amounts are in rupees. Orders and invoices are kept even after an account is deleted, because tax law requires it.",
    exportedAt: new Date().toISOString(),
    profile: {
      email: me.email,
      name: me.name,
      mobile: me.phone,
      signsInWithGoogle: !!me.googleSub,
      marketingEmails: me.marketingOptIn,
      marketingConsentAt: me.marketingOptInAt,
      accountCreatedAt: me.createdAt,
      lastSignInAt: me.lastLoginAt,
      deletionRequestedAt: me.deletionRequestedAt,
    },
    savedAddresses: addressRows.map((a) => ({ name: a.name, mobile: a.phone, line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, state: a.state, pincode: a.pincode, isDefault: a.isDefault, savedAt: a.createdAt })),
    orders: myOrders.map((o) => ({
      orderNumber: o.orderNumber,
      placedAt: o.placedAt,
      status: STATUS_LABELS[o.status],
      payment: o.paymentMethod === "COD" ? "Cash on delivery" : "Online",
      paymentStatus: PAYMENT_STATUS_LABELS[o.paymentStatus],
      email: o.email,
      mobile: o.phone,
      deliverTo: { name: o.shipName, mobile: o.shipPhone, address: formatAddress(o) },
      gstin: o.billingGstin || undefined,
      businessName: o.billingBusinessName || undefined,
      note: o.customerNote || undefined,
      items: items
        .filter((i) => i.orderId === o.id)
        .map((i) => ({ product: i.productName, pack: i.variantTitle, quantity: i.quantity, price: rupees(i.unitPricePaise), total: rupees(i.lineTotalPaise) })),
      itemsTotal: rupees(o.subtotalPaise),
      discount: rupees(o.discountPaise),
      couponCode: o.couponCode ?? undefined,
      pointsUsed: o.pointsRedeemed || undefined,
      shipping: rupees(o.shippingPaise),
      codFee: rupees(o.codFeePaise),
      total: rupees(o.totalPaise),
      invoice: invoiceRows.find((iv) => iv.orderId === o.id)?.invoiceNumber,
      updatesOnWhatsapp: o.whatsappOptIn,
      updates: events.filter((e) => e.orderId === o.id).map((e) => ({ at: e.createdAt, message: e.message })),
    })),
    reviews: reviewRows,
    savedForLater: saved,
    loyaltyPoints: {
      balance: points.reduce((s, p) => s + p.points, 0),
      history: points.map((p) => ({ at: p.createdAt, points: p.points, reason: POINT_REASONS[p.reason], order: p.orderId ? orderNumber.get(p.orderId) : undefined, note: p.note || undefined })),
    },
    referralCode: referral[0]?.code ?? null,
    emailPreferences: {
      newsletter: newsletter[0] ? { subscribedAt: newsletter[0].consentedAt, unsubscribedAt: newsletter[0].unsubscribedAt, source: newsletter[0].source } : null,
      optedOutOfReminders: optOut.length > 0,
    },
    backInStockRequests: alerts.map((a) => ({ product: a.product, pack: Object.values(a.options).join(" · "), requestedAt: a.requestedAt, emailedAt: a.emailedAt })),
    reorderReminders: refills.map((r) => ({ order: orderNumber.get(r.orderId), everyDays: r.intervalDays, nextReminder: r.cancelledAt ? null : r.nextRemindAt, stoppedAt: r.cancelledAt })),
    problemReports: reports.map((r) => ({
      order: orderNumber.get(r.orderId),
      reportedAt: r.createdAt,
      problem: PROBLEM_KIND_LABELS[r.kind],
      description: r.description,
      photosSent: photos.filter((p) => p.reportId === r.id).length,
      status: PROBLEM_STATUS_LABELS[r.status],
      ourReply: r.resolutionNote || undefined,
    })),
    businessEnquiries: enquiryRows.map((e) => ({ sentAt: e.createdAt, name: e.name, business: e.businessName, gstin: e.gstin, mobile: e.phone, city: e.city, requirement: e.requirement })),
    signedInDevices: devices,
  };
}
