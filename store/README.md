# The Farm Door: online store

A complete, custom e-commerce system for The Farm Door (Indian spices): storefront, cart and checkout,
Razorpay payments, courier-rate shipping by pincode, order tracking, GST invoices, and an admin panel
with reports.

- **Owner's launch checklist:** [../LAUNCH-CHECKLIST.md](../LAUNCH-CHECKLIST.md)
- **Putting it online:** [DEPLOYMENT.md](DEPLOYMENT.md)

## Stack

| Part | Choice |
|---|---|
| Web app | Next.js 16 (App Router, Cache Components, Server Actions), React 19, TypeScript |
| Styling | Tailwind CSS 4, brand fonts Fraunces + Manrope (self-hosted by `next/font`) |
| Database | PostgreSQL 16+ via Drizzle ORM (`src/db/schema.ts`, migrations in `drizzle/`) |
| Payments | Razorpay Orders API + Checkout.js + webhooks (`src/server/payments/`) |
| Shipping | Shiprocket API: serviceability/rates, order + AWB + pickup + label, tracking webhook (`src/server/shipping/`) |
| Email | SMTP via Nodemailer (any provider), or a development log (`src/server/email/`) |
| Tests | Vitest against a real Postgres test database (`tests/`, `src/**/*.test.ts`) |

Images are resized to WebP and stored in Postgres (`media` table), so the app needs only one database.

## Running it locally

Requirements: Node 20.9+ (developed on 26), and PostgreSQL. This machine uses a project-local cluster
started from Postgres.app's binaries.

```bash
npm install
npm run db:start      # starts the local Postgres in .pgdata on port 54329
npm run db:migrate    # applies migrations
npm run db:seed       # SAMPLE catalogue + owner account (writes DEV_CREDENTIALS.md)
npm run dev           # http://localhost:3000, admin at /admin
```

`.env.local` holds local settings (see `.env.example` for every variable). Until real accounts exist,
development uses **clearly labelled simulated providers** (`PAYMENTS_PROVIDER=mock`,
`SHIPPING_PROVIDER=mock`, `EMAIL_TRANSPORT=log`). The site shows a red TEST MODE banner while any of
these are on, and the app refuses to start in production with them unless `ALLOW_MOCK_PROVIDERS=true`.

- Customer sign-in codes and all emails appear in the terminal and in **Admin > Email log**.
- Simulated checkout shows "Simulated payment" buttons instead of Razorpay.
- **Admin > Order > Test mode** buttons move a simulated shipment through the courier statuses.
- Run the scheduled job once: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/tick`

Other commands: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`,
`npm run db:generate` (after editing the schema), `npm run staff:create -- --email … --name … --role OWNER`.

## How the important parts work

**Money.** All amounts are integer paise; GST rates are basis points. Prices shown to customers include
GST. `src/lib/pricing.ts` is the single pricing function (coupon, discount allocation, shipping, COD fee,
GST split) used by the cart, checkout and order placement, so the customer always pays what they saw.

**Checkout** (`src/server/orders/place.ts`). The server recalculates everything from the database. If the
total differs from what the page showed, no order is created and the customer sees the new total. In one
transaction it creates the order and lines, **holds stock**, claims the coupon use and clears the cart. An
idempotency key per checkout makes double-clicks return the same order.

**Payments** (`src/server/orders/payment.ts`). An order is confirmed only by `processGatewayPayment`,
which takes a payment **fetched from Razorpay's API** with status captured and the exact order amount.
It is called from the checkout success handler (after HMAC signature verification), from webhooks and
from the reconciliation job, and is idempotent. A duplicate payment is refunded automatically. A payment
that arrives after the hold expired is honoured if stock is still available, otherwise refunded.

**Stock** (`src/server/inventory.ts`). Variants draw from stock pools: packed pools (count packs) or
loose pools (count grams shared by several pack sizes). Every change is one conditional `UPDATE`, so
concurrent checkouts can't oversell (tested with 25 parallel buyers for 10 packs). Lifecycle: reserve →
commit on confirmation, or release on expiry/cancel. Every change is written to `stock_movements`.

**Orders** (`src/server/orders/lifecycle.ts`). Statuses: Awaiting payment / Awaiting COD confirmation →
Confirmed → Packed (invoice issued, courier booked, label created) → Shipped → Out for delivery →
Delivered, plus Delivery failed, Returned to origin and Cancelled. Payment status is tracked separately.
Cash-on-delivery orders are confirmed by the customer through an emailed link (or by staff after a call).

**Invoices** (`src/server/orders/invoices.ts`). GST tax invoices are issued at packing, numbered per
financial year (`TFD/26-27/00001`), CGST+SGST within Rajasthan and IGST elsewhere, and frozen as a
snapshot. Refunds on invoiced orders create credit notes. In production, invoices can't be issued until
the GSTIN, legal name and address are set.

**Security.** Customer sign-in uses one-time email codes (plus optional Google); staff use a password
(scrypt) **and** an authenticator app (TOTP, secret encrypted with AES-256-GCM), with lockout and rate
limits. Sessions are random tokens stored hashed. Roles (Owner, Manager, Packing staff, Accountant) are
checked on the server for every page, action and export. Webhooks are signature/token checked; the cron
endpoint needs a bearer secret; CSV exports defuse spreadsheet formulas; uploads are re-encoded; strict
security headers and a Content Security Policy are set in `next.config.ts`. Important admin actions are
written to an audit log.

**Caching.** Catalogue reads use `"use cache"` with tags (`catalog`, `stock`, `settings`, `reviews`),
refreshed when the admin changes something or stock moves. Personal pages render per request.

## Folder map

```
src/
  app/(shop)/        storefront pages      app/admin/      admin panel
  app/api/           webhooks, cron, Google sign-in, health
  actions/           server actions (forms)  data/       request-scoped helpers (session, cart cookie, cached reads)
  server/            business logic (no Next.js APIs): orders, payments, shipping, inventory, reports…
  lib/               pure helpers: money, pricing, GST/India, crypto, TOTP
  db/                schema and client
scripts/             migrate, seed, create-staff
tests/               integration tests (need the farmdoor_test database)
```

## Tests

`npm test` runs unit and integration tests (51) against `farmdoor_test` on the local Postgres. They cover
pricing and GST, coupons, stock concurrency, the full order and payment lifecycle (including duplicate
and late payments, expiry, COD, cancellation refunds, packing and delivery), webhooks, the scheduled job,
roles and staff safeguards.
