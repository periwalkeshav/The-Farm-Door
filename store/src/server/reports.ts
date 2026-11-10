/**
 * Business reports. Definitions (shown in the admin panel too):
 *
 *  - An order counts as a sale when it is CONFIRMED (online payment verified,
 *    or cash-on-delivery order confirmed). Unpaid, failed and expired orders
 *    never count.
 *  - Gross sales: items at selling price (incl. GST), before coupon discounts.
 *  - Discounts: coupon discounts on those orders.
 *  - Refunds & reversals: money refunded (online or manual) in the period, plus
 *    the item value of confirmed cash-on-delivery orders cancelled or returned
 *    undelivered in the period (no money was collected for those).
 *  - Net sales = gross − discounts − refunds & reversals (incl. GST). The
 *    "excl. GST" figure removes GST at the period's average item tax rate.
 *  - Shipping, COD fees and GST collected are reported separately.
 *  - Periods are Indian Standard Time calendar days.
 */
import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";

export type Range = { from: Date; to: Date }; // [from, to)

const IST_OFFSET_MS = 5.5 * 3600_000;

export function istDayStart(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00+05:30`);
}

export function istToday(now = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive IST dates → half-open UTC range. */
export function rangeFromDates(fromDate: string, toDate: string): Range {
  return { from: istDayStart(fromDate), to: istDayStart(addDays(toDate, 1)) };
}

export function previousRange(r: Range): Range {
  const len = r.to.getTime() - r.from.getTime();
  return { from: new Date(r.from.getTime() - len), to: r.from };
}

async function one<T>(db: DbOrTx, q: ReturnType<typeof sql>): Promise<T> {
  const res = await db.execute(q);
  return res.rows[0] as T;
}

async function many<T>(db: DbOrTx, q: ReturnType<typeof sql>): Promise<T[]> {
  const res = await db.execute(q);
  return res.rows as T[];
}

const n = (v: unknown) => Number(v ?? 0);

export type SalesSummary = {
  orders: number;
  grossPaise: number;
  discountPaise: number;
  refundsPaise: number;
  codReversalsPaise: number;
  netPaise: number;
  netExGstPaise: number;
  shippingPaise: number;
  codFeesPaise: number;
  gstPaise: number;
  aovPaise: number;
  customers: number;
  newCustomers: number;
  returningCustomers: number;
};

export async function salesSummary(db: DbOrTx, r: Range): Promise<SalesSummary> {
  const base = await one<Record<string, unknown>>(
    db,
    sql`select count(*) as orders,
          coalesce(sum(subtotal_paise),0) as gross,
          coalesce(sum(discount_paise),0) as discount,
          coalesce(sum(shipping_paise),0) as shipping,
          coalesce(sum(cod_fee_paise),0) as cod_fees,
          coalesce(sum(tax_paise),0) as gst,
          coalesce(sum(total_paise),0) as total,
          count(distinct customer_id) as customers
        from orders where confirmed_at >= ${r.from} and confirmed_at < ${r.to} and replacement_for_order_id is null`,
  );
  const ratio = await one<{ taxable: unknown; total: unknown }>(
    db,
    sql`select coalesce(sum(oi.taxable_value_paise),0) as taxable, coalesce(sum(oi.line_total_paise),0) as total
        from order_items oi join orders o on o.id = oi.order_id
        where o.confirmed_at >= ${r.from} and o.confirmed_at < ${r.to}`,
  );
  const refunds = await one<{ amount: unknown }>(
    db,
    sql`select coalesce(sum(rf.amount_paise),0) as amount
        from refunds rf left join payments p on p.id = rf.payment_id
        where rf.status <> 'FAILED' and coalesce(p.is_duplicate,false) = false
          and rf.created_at >= ${r.from} and rf.created_at < ${r.to}`,
  );
  const reversals = await one<{ amount: unknown }>(
    db,
    sql`select coalesce(sum(o.subtotal_paise - o.discount_paise),0) as amount
        from orders o
        where o.payment_method = 'COD' and o.confirmed_at is not null
          and o.status in ('CANCELLED','RETURNED_TO_ORIGIN')
          and coalesce(o.cancelled_at, (select max(e.created_at) from order_events e where e.order_id = o.id and e.type = 'shipment.rto_delivered'), o.updated_at) >= ${r.from}
          and coalesce(o.cancelled_at, (select max(e.created_at) from order_events e where e.order_id = o.id and e.type = 'shipment.rto_delivered'), o.updated_at) < ${r.to}`,
  );
  const cust = await one<{ new_customers: unknown; returning_customers: unknown }>(
    db,
    sql`with period as (
          select distinct customer_id from orders where confirmed_at >= ${r.from} and confirmed_at < ${r.to} and customer_id is not null and replacement_for_order_id is null
        ), first_orders as (
          select customer_id, min(confirmed_at) as first_at from orders where confirmed_at is not null and replacement_for_order_id is null and customer_id in (select customer_id from period) group by customer_id
        )
        select count(*) filter (where first_at >= ${r.from}) as new_customers,
               count(*) filter (where first_at < ${r.from}) as returning_customers
        from first_orders`,
  );
  const orders = n(base.orders);
  const gross = n(base.gross);
  const discount = n(base.discount);
  const refundsPaise = n(refunds.amount);
  const codReversals = n(reversals.amount);
  const net = gross - discount - refundsPaise - codReversals;
  const taxRatio = n(ratio.total) > 0 ? n(ratio.taxable) / n(ratio.total) : 1;
  return {
    orders,
    grossPaise: gross,
    discountPaise: discount,
    refundsPaise,
    codReversalsPaise: codReversals,
    netPaise: net,
    netExGstPaise: Math.round(net * taxRatio),
    shippingPaise: n(base.shipping),
    codFeesPaise: n(base.cod_fees),
    gstPaise: n(base.gst),
    aovPaise: orders ? Math.round(n(base.total) / orders) : 0,
    customers: n(base.customers),
    newCustomers: n(cust.new_customers),
    returningCustomers: n(cust.returning_customers),
  };
}

export type SeriesPoint = { bucket: string; orders: number; netPaise: number };

/** Orders and item sales (after discount) per day/week/month, IST. */
export async function salesSeries(db: DbOrTx, r: Range, unit: "day" | "week" | "month"): Promise<SeriesPoint[]> {
  const rows = await many<{ bucket: string; orders: unknown; net: unknown }>(
    db,
    sql`with b as (
          select generate_series(date_trunc(${unit}, ${r.from}::timestamptz at time zone 'Asia/Kolkata'),
                                 date_trunc(${unit}, (${r.to}::timestamptz - interval '1 second') at time zone 'Asia/Kolkata'),
                                 ('1 ' || ${unit})::interval) as bucket
        ), s as (
          select date_trunc(${unit}, confirmed_at at time zone 'Asia/Kolkata') as bucket, count(*) as orders, sum(subtotal_paise - discount_paise) as net
          from orders where confirmed_at >= ${r.from} and confirmed_at < ${r.to} and replacement_for_order_id is null
          group by 1
        )
        select to_char(b.bucket, 'YYYY-MM-DD') as bucket, coalesce(s.orders,0) as orders, coalesce(s.net,0) as net
        from b left join s on s.bucket = b.bucket order by b.bucket`,
  );
  return rows.map((x) => ({ bucket: x.bucket, orders: n(x.orders), netPaise: n(x.net) }));
}

export async function topProducts(db: DbOrTx, r: Range, limit = 10) {
  const rows = await many<{ product_id: number | null; name: string; units: unknown; revenue: unknown; cost: unknown; cost_known: unknown }>(
    db,
    sql`select oi.product_id, max(oi.product_name) as name, sum(oi.quantity) as units, sum(oi.line_total_paise) as revenue,
               sum(oi.cost_paise) as cost, bool_and(oi.cost_paise is not null) as cost_known
        from order_items oi join orders o on o.id = oi.order_id
        where o.confirmed_at >= ${r.from} and o.confirmed_at < ${r.to}
        group by oi.product_id order by revenue desc limit ${limit}`,
  );
  return rows.map((x) => ({ productId: x.product_id, name: x.name, units: n(x.units), revenuePaise: n(x.revenue), costPaise: x.cost_known ? n(x.cost) : null }));
}

export async function revenueByCategory(db: DbOrTx, r: Range) {
  const rows = await many<{ name: string | null; revenue: unknown; units: unknown }>(
    db,
    sql`select c.name, sum(oi.line_total_paise) as revenue, sum(oi.quantity) as units
        from order_items oi join orders o on o.id = oi.order_id left join categories c on c.id = oi.category_id
        where o.confirmed_at >= ${r.from} and o.confirmed_at < ${r.to}
        group by c.name order by revenue desc`,
  );
  return rows.map((x) => ({ name: x.name ?? "Uncategorised", revenuePaise: n(x.revenue), units: n(x.units) }));
}

export async function statusDistribution(db: DbOrTx, r: Range) {
  const rows = await many<{ status: string; count: unknown }>(
    db,
    sql`select status, count(*) as count from orders where placed_at >= ${r.from} and placed_at < ${r.to} group by status order by count desc`,
  );
  return rows.map((x) => ({ status: x.status, count: n(x.count) }));
}

export async function paymentStats(db: DbOrTx, r: Range) {
  const p = await one<Record<string, unknown>>(
    db,
    sql`select count(*) filter (where status in ('CAPTURED','REFUNDED','PARTIALLY_REFUNDED') and not is_duplicate) as succeeded,
               count(*) filter (where status = 'FAILED') as failed,
               coalesce(sum(coalesce(fee_paise,0) + coalesce(tax_on_fee_paise,0)) filter (where not is_duplicate),0) as fees
        from payments where created_at >= ${r.from} and created_at < ${r.to}`,
  );
  const o = await one<Record<string, unknown>>(
    db,
    sql`select count(*) filter (where payment_method = 'PREPAID' and confirmed_at is null and status = 'CANCELLED') as expired_unpaid,
               count(*) filter (where payment_method = 'PREPAID') as prepaid_placed,
               count(*) filter (where payment_method = 'COD') as cod_placed,
               count(*) filter (where payment_method = 'COD' and status = 'CANCELLED' and confirmed_at is null) as cod_unconfirmed
        from orders where placed_at >= ${r.from} and placed_at < ${r.to}`,
  );
  const refunds = await one<Record<string, unknown>>(
    db,
    sql`select count(*) as count, coalesce(sum(amount_paise),0) as amount from refunds where status <> 'FAILED' and created_at >= ${r.from} and created_at < ${r.to}`,
  );
  const cancelled = await one<Record<string, unknown>>(
    db,
    sql`select count(*) as count, coalesce(sum(total_paise),0) as amount from orders where confirmed_at is not null and status = 'CANCELLED' and cancelled_at >= ${r.from} and cancelled_at < ${r.to}`,
  );
  const succeeded = n(p.succeeded);
  const failed = n(p.failed);
  return {
    succeeded,
    failedAttempts: failed,
    successRate: succeeded + failed > 0 ? succeeded / (succeeded + failed) : null,
    gatewayFeesPaise: n(p.fees),
    expiredUnpaid: n(o.expired_unpaid),
    prepaidPlaced: n(o.prepaid_placed),
    codPlaced: n(o.cod_placed),
    codUnconfirmed: n(o.cod_unconfirmed),
    refunds: n(refunds.count),
    refundsPaise: n(refunds.amount),
    cancelledAfterConfirm: n(cancelled.count),
    cancelledAfterConfirmPaise: n(cancelled.amount),
  };
}

export async function couponUsage(db: DbOrTx, r: Range) {
  const rows = await many<{ code: string; uses: unknown; discount: unknown }>(
    db,
    sql`select c.code, count(*) as uses, sum(cr.discount_paise) as discount
        from coupon_redemptions cr join coupons c on c.id = cr.coupon_id join orders o on o.id = cr.order_id
        where cr.is_active and o.confirmed_at >= ${r.from} and o.confirmed_at < ${r.to}
        group by c.code order by uses desc`,
  );
  return rows.map((x) => ({ code: x.code, uses: n(x.uses), discountPaise: n(x.discount) }));
}

export async function shippingPerformance(db: DbOrTx, r: Range) {
  const s = await one<Record<string, unknown>>(
    db,
    sql`select count(*) filter (where o.status = 'DELIVERED') as delivered,
               count(*) filter (where o.status = 'RETURNED_TO_ORIGIN') as rto,
               count(*) filter (where o.shipped_at is not null) as shipped,
               avg(extract(epoch from (o.delivered_at - o.shipped_at)) / 86400) filter (where o.delivered_at is not null and o.shipped_at is not null) as avg_transit_days,
               avg(extract(epoch from (o.packed_at - o.confirmed_at)) / 3600) filter (where o.packed_at is not null) as avg_hours_to_pack,
               coalesce(sum(o.shipping_paise),0) as charged,
               coalesce(sum((o.shipping_quote->>'quotedCostPaise')::int) filter (where o.shipped_at is not null),0) as courier_cost
        from orders o where o.confirmed_at >= ${r.from} and o.confirmed_at < ${r.to}`,
  );
  const shipped = n(s.shipped);
  return {
    shipped,
    delivered: n(s.delivered),
    rto: n(s.rto),
    rtoRate: shipped ? n(s.rto) / shipped : null,
    avgTransitDays: s.avg_transit_days === null ? null : Math.round(n(s.avg_transit_days) * 10) / 10,
    avgHoursToPack: s.avg_hours_to_pack === null ? null : Math.round(n(s.avg_hours_to_pack) * 10) / 10,
    shippingChargedPaise: n(s.charged),
    courierCostPaise: n(s.courier_cost),
  };
}

export async function codOutstanding(db: DbOrTx) {
  const x = await one<Record<string, unknown>>(
    db,
    sql`select count(*) as count, coalesce(sum(total_paise),0) as amount from orders
        where payment_method = 'COD' and payment_status = 'COD_PENDING' and status in ('CONFIRMED','PACKED','SHIPPED','OUT_FOR_DELIVERY','DELIVERY_FAILED')`,
  );
  return { count: n(x.count), amountPaise: n(x.amount) };
}

export async function lowStock(db: DbOrTx) {
  return many<{ id: number; name: string; sku: string; unit: string; available: number; threshold: number }>(
    db,
    sql`select id, name, sku, unit, (on_hand - reserved) as available, low_stock_threshold as threshold
        from inventory_items where is_active and (on_hand - reserved) <= low_stock_threshold order by (on_hand - reserved) asc limit 50`,
  );
}

export async function workQueue(db: DbOrTx) {
  return one<{ to_pack: number; awaiting_cod: number; awaiting_payment: number; delivery_failed: number; pending_reviews: number; new_enquiries: number; open_problems: number }>(
    db,
    sql`select (select count(*) from orders where status = 'CONFIRMED')::int as to_pack,
               (select count(*) from orders where status = 'AWAITING_COD_CONFIRMATION')::int as awaiting_cod,
               (select count(*) from orders where status = 'AWAITING_PAYMENT')::int as awaiting_payment,
               (select count(*) from orders where status = 'DELIVERY_FAILED')::int as delivery_failed,
               (select count(*) from reviews where status = 'PENDING')::int as pending_reviews,
               (select count(*) from enquiries where status = 'NEW')::int as new_enquiries,
               (select count(*) from problem_reports where status = 'OPEN')::int as open_problems`,
  );
}

/** GST sales register for GSTR-1 preparation: one row per invoice line, from invoice snapshots. */
export async function gstRegister(db: DbOrTx, r: Range) {
  return many<{
    invoice_number: string;
    issued_at: Date;
    order_number: string;
    buyer_gstin: string;
    buyer_name: string;
    place_of_supply: string;
    hsn: string;
    description: string;
    quantity: number;
    rate_bp: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  }>(
    db,
    sql`select i.invoice_number, i.issued_at, o.order_number,
               i.snapshot->'buyer'->>'gstin' as buyer_gstin,
               coalesce(nullif(i.snapshot->'buyer'->>'businessName',''), i.snapshot->'buyer'->>'name') as buyer_name,
               i.snapshot->>'placeOfSupply' as place_of_supply,
               l->>'hsnCode' as hsn, l->>'description' as description, (l->>'quantity')::int as quantity, (l->>'gstRateBp')::int as rate_bp,
               (l->>'taxableValuePaise')::int as taxable, (l->>'cgstPaise')::int as cgst, (l->>'sgstPaise')::int as sgst, (l->>'igstPaise')::int as igst, (l->>'totalPaise')::int as total
        from invoices i join orders o on o.id = i.order_id, jsonb_array_elements(i.snapshot->'lines') as l
        where i.issued_at >= ${r.from} and i.issued_at < ${r.to}
        order by i.issued_at, i.invoice_number`,
  );
}

export async function hsnSummary(db: DbOrTx, r: Range) {
  return many<{ hsn: string; rate_bp: number; quantity: number; taxable: number; cgst: number; sgst: number; igst: number; total: number }>(
    db,
    sql`select l->>'hsnCode' as hsn, (l->>'gstRateBp')::int as rate_bp, sum((l->>'quantity')::int)::int as quantity,
               sum((l->>'taxableValuePaise')::int)::int as taxable, sum((l->>'cgstPaise')::int)::int as cgst, sum((l->>'sgstPaise')::int)::int as sgst,
               sum((l->>'igstPaise')::int)::int as igst, sum((l->>'totalPaise')::int)::int as total
        from invoices i, jsonb_array_elements(i.snapshot->'lines') as l
        where i.issued_at >= ${r.from} and i.issued_at < ${r.to}
        group by 1, 2 order by 1, 2`,
  );
}

export async function creditNoteRegister(db: DbOrTx, r: Range) {
  return many<{ note_number: string; issued_at: Date; invoice_number: string; amount: number; taxable: number; cgst: number; sgst: number; igst: number }>(
    db,
    sql`select cn.note_number, cn.issued_at, i.invoice_number, cn.amount_paise as amount,
               (cn.snapshot->'totals'->>'taxableValuePaise')::int as taxable, (cn.snapshot->'totals'->>'cgstPaise')::int as cgst,
               (cn.snapshot->'totals'->>'sgstPaise')::int as sgst, (cn.snapshot->'totals'->>'igstPaise')::int as igst
        from credit_notes cn join invoices i on i.id = cn.invoice_id
        where cn.issued_at >= ${r.from} and cn.issued_at < ${r.to} order by cn.issued_at`,
  );
}
