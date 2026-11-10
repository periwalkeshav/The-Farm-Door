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

Requirements: Node 22.12+ (the test runner's minimum; developed and tested on 26), and PostgreSQL. This
machine uses a project-local cluster started from Postgres.app's binaries; the first `npm run db:start`
creates it.

**Setting up on another computer** (testers, new developers): follow
[../SETUP-FOR-TESTERS.md](../SETUP-FOR-TESTERS.md). After starting a database, `npm run setup` writes
`.env.local` with simulated providers and fresh secrets, creates the databases, migrates and seeds.

```bash
npm install
npm run db:start      # starts the local Postgres in .pgdata on port 54329
npm run db:migrate    # applies migrations
npm run db:seed       # SAMPLE catalogue + owner account (writes DEV_CREDENTIALS.md)
npm run dev           # http://localhost:3000, admin at /admin
npm run db:stop       # stops the local Postgres when you're done
```

When the sample catalogue grows (new categories or sample products), bring an existing demo database
up to date without wiping your test orders or sign-in:

```bash
npm run db:seed -- --update
```

`.env.local` holds local settings (see `.env.example` for every variable). Until real accounts exist,
development uses **clearly labelled simulated providers** (`PAYMENTS_PROVIDER=mock`,
`SHIPPING_PROVIDER=mock`, `EMAIL_TRANSPORT=log`). The site shows a red TEST MODE banner while any of
these are on, and the app refuses to start in production with them unless `ALLOW_MOCK_PROVIDERS=true`.

- Customer sign-in codes and all emails appear in the terminal and in **Admin > Email log**.
- Simulated checkout shows "Simulated payment" buttons instead of Razorpay.
- **Admin > Order > Test mode** buttons move a simulated shipment through the courier statuses.
- Run the scheduled job once: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/tick`

Other commands: `npm test`, `npm run test:e2e`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run db:backup`,
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
the GSTIN, legal name and address are set. `src/server/orders/invoice-pdf.ts` draws the same snapshot as
a PDF (pdfkit, standard fonts, amounts in "Rs."): attached to the "shipped" email (invoice) and the refund
email (credit note), and downloadable at `/orders/<number>/invoice.pdf`.

**Problems with delivered orders** (`src/server/problems.ts`, Admin > Problem reports). Within 48 hours
of delivery the customer can report a damaged, wrong, expired or missing item from the order page, with
1 to 4 photos (shrunk in the browser, then re-encoded on the server, which strips location data). Photos
are stored apart from catalogue images and served only to staff (`/admin/problem-photos/<id>`). Staff
resolve a report by sending a free replacement (a ₹0 order with `replacementForOrderId`, stock taken
straight away, packed like any order, no tax invoice; the courier gets the original invoice number and
the MRP as declared value), refunding through the normal refund flow, or replying and closing. The
customer is emailed at each step. Replacements are left out of sales figures and review requests.

**Security.** Customer sign-in uses one-time email codes (plus optional Google); staff use a password
(scrypt) **and** an authenticator app (TOTP, secret encrypted with AES-256-GCM), with lockout and rate
limits. Staff get ten one-time backup codes right after setting up the authenticator
(`src/server/auth/recovery-codes.ts`; only keyed hashes stored; using one emails the staff member), and
`npm run staff:reset-2fa -- --email …` resets 2-step verification from the server if the only owner is
locked out. Sessions are random tokens stored hashed. Roles (Owner, Manager, Packing staff, Accountant) are
checked on the server for every page, action and export. Webhooks are signature/token checked; the cron
endpoint needs a bearer secret; CSV exports defuse spreadsheet formulas; uploads are re-encoded; strict
security headers and a Content Security Policy are set in `next.config.ts`. Important admin actions are
written to an audit log.

**Customer emails beyond orders** (`src/server/reminders.ts`, `src/server/newsletter.ts`). One reminder
goes out a few hours after an online-payment order expires unpaid, linking to the order page where
"Add these items to my cart" refills the cart. It's skipped if the customer ordered again, was reminded
in the last week, or opted out at `/unsubscribe` (a signed link; opting out needs a button press, so email
scanners can't trigger it). The newsletter list takes sign-ups from the footer and checkout, plus an
import of the coming-soon page's Netlify CSV, marked "launch news only". Campaigns are sent from an
external email-marketing tool using **Admin > Newsletter > Download CSV**. Order emails set Reply-To to
the support email in Settings.

**Business enquiries** (`src/server/enquiries.ts`). `/bulk-orders` collects bulk requirements, emails
the owner and the customer, and lists them in **Admin > Business enquiries** with a status and notes.

**Analytics** (`src/components/shop/analytics-consent.tsx`). Off unless a GA4 measurement ID is set in
**Admin > Settings > Analytics**. Then a consent banner appears; Google's script loads only after
"Accept", "Decline" removes its cookies, and the privacy policy text follows the setting.

**Catalogue spreadsheets** (`src/server/catalog/import.ts`, Admin > Products > Import / export). One CSV
row per pack size. Import checks every row first and lists problems by row and column; nothing changes
until "Import". It creates and updates (matched by web address and SKU), never deletes, and never changes
stock for existing packs. "Download current catalogue" exports the same format for bulk price edits.

**Site errors** (`src/instrumentation.ts`, `src/server/errors.ts`, Admin > Site errors). Server errors
(via Next.js `onRequestError`) and browser errors (`/api/client-errors`) are grouped, listed, and emailed
to the owner at most hourly per error and 20 a day. Query strings are stripped (they can hold private
order links). Redirects and not-found signals are ignored.

**Backups.** `npm run db:backup` saves a dump to `backups/`. `.github/workflows/db-backup.yml` makes an
encrypted nightly dump once the repository is on GitHub (see DEPLOYMENT.md).

**Retention.**
- **Unpaid-order reminder** (`src/server/reminders.ts`).
- **Review request** after delivery.
- **Back-in-stock emails** (`src/server/stock-alerts.ts`); customers sign up on a sold-out pack.
- **Reorder reminders** (`src/server/refills.ts`); customers set them on a delivered order.
- **Wishlist** (`src/server/wishlist.ts`).
- **"Often bought together"**, from at least two shared confirmed orders.

All emails respect the `/unsubscribe` opt-out, and all are sent by the 5-minute job.

**Loyalty points and referrals** (`src/server/loyalty.ts`). Off by default. Points live in an append-only
ledger:
- **Earned** on delivery.
- **Spent** at checkout as a discount spread across the items, so GST is on the reduced price. They're
  locked with a row lock when the order is placed.
- **Returned** if the order is cancelled.
- **Taken back** in proportion to any refund.

Referral codes are coupons tied to a customer (`referrerCustomerId`). They work for a new customer's
first order only, and reward the referrer on delivery.

**Gift boxes** (`src/server/kits.ts`, Admin > Inventory > a pack pool). A box is a pack pool with a
recipe. "Make up boxes" moves stock from the contents into boxes (reason ASSEMBLY in the ledger), so
selling a box works like any pack.

**Recipes** (`src/server/recipes.ts`, Admin > Recipes). Shown at `/recipes`, with Recipe structured data,
and on the product pages of the spices they use.

**Google Shopping feed.** `/feeds/google-merchant.xml`: one item per pack, for products with a photo.
Spices are given Google's "Seasonings & Spices" category; for everything else Google picks one.

**Categories and collections** (Admin › Categories & collections).
- **Categories.** Spices, Oils, Pulses, Grains, Honey, Dry Fruits and Others, with Hindi names, listed in
  `scripts/categories.ts`. `npm run catalog:categories` creates any that are missing (safe on the live
  database). Each product has one category. A category is shown to shoppers only once it has a product on
  sale, so empty ones never lead to an empty page.
- **Where they appear.** The desktop header has a "Categories" dropdown; the phone menu, footer and shop
  page list them all. The home page draws an icon for each, chosen from words in its web address (oil,
  honey, grain/rice/millet, pulse/dal, dry/nut, spice…; anything else gets a parcel).
- **Filters inside a category.** A collection set to "Filter inside" a category becomes a filter button
  on that category's page (`/category/spices?group=whole-spices`). That's how Whole spices, Ground spices
  and Masala blends sit inside Spices.

**Sold by weight or volume** (`products.net_unit`, Admin › product › Details › Sold by). Oils and other
liquids are sold by volume: the pack's net quantity is in millilitres (the column is still called
`net_weight_grams`), prices show per 100 ml, and sizes read "500 ml", "1 L". The Google feed's unit
pricing follows. Packed weights for courier rates are always grams.

**Scheduled sales** (`src/server/sales.ts`, Admin > Sales). A percentage off selling prices between two
IST date-times, for everything, some categories or some products. The sale price (rounded to whole
rupees, never above the normal price) is applied on the server wherever a price is read: product cards
and pages, cart lines, checkout and the order, and the Google feed. Overlapping sales don't stack (the
biggest wins); coupons and points apply on top. Cached shop pages pick up a start or end within a couple
of minutes; checkout always uses the exact price, and the usual "price changed" check protects orders.

**Search** (`src/lib/search.ts`). Every real word must match, against the product name, tags, category,
pack options and description. It understands Hindi names in English letters or Devanagari ("haldi",
"जीरा", "lal mirch"), small typos ("turmric") and partly typed words, ranks name matches first, and offers
"Did you mean…?" when nothing matches. `/api/search` feeds the suggestions shown as you type
(`src/components/shop/search-box.tsx`, an accessible combobox). Owners can add more names as product tags.

**Images** (`src/server/media.ts`). Each upload is stored as WebP in four sizes (300 and 600 px squares,
800 and 1600 px wide); pages use `srcset`/`sizes` so phones download the small ones, and below-the-fold
images load lazily. Older images get their new sizes the first time they're requested.

**Link previews** (`src/lib/og-image.tsx`). The home page, shop, categories, collections and recipes get
branded 1200×630 preview images drawn on request; product and recipe pages use their own photo.

**Home page motion** (`src/components/shop/hero-carousel.tsx`, `spice-art.tsx`, `motion.tsx`, keyframes at the
end of `globals.css`). The banner moves to the next slide every 7 seconds. Its slides follow your
settings: the welcome slide, a running sale, free shipping (when a threshold is set), recipes (when any
are published) and bulk orders. A ticker scrolls the store's promises across the top of every page.
Spice drawings float, a van drives along the "how it works" road, and sections rise into view as you
scroll. All drawings are inline SVG (nothing extra to download). Nothing moves for visitors whose device
asks for reduced motion. The pause button in the ticker stops every animation, and that choice is
remembered (WCAG 2.2.2). The banner also holds still while the pointer is over it or keyboard focus is
inside it, then carries on from where it stopped.

**Buying faster.**
- Product cards have a dropdown of every pack (each option combination, e.g. "Jar · 200 g", sold-out ones
  marked) and an "Add to cart" button (`quick-add.tsx`). The price follows the chosen pack; phones show
  their own picker.
- The product page has:
  - pack-size cards, each with its price, price per 100 g and saving;
  - a sticky "Add to cart" bar once the main button scrolls away;
  - "Often bought together" with tick boxes, a total and "Add all" (`bundle-builder.tsx`). Until there
    are enough orders, it shows other spices from the same shelf as "Complete your spice box";
  - a trust strip built from your settings, and the FSSAI number once it's set.
- Reviews show a star breakdown and the reviewer's delivery city. The review form says the city is shown.
- Phones get a floating cart button; every page has a short "Added" pop-up and a back-to-top button
  (`cart-feedback.tsx`).

**Home page extras.**
- Round category icons sit under the banner.
- Bestsellers (the `bestsellers` collection) get rank numbers.
- "Shop by dish" chips list the collections ticked "In Shop by dish" in Admin > Categories & collections.
- The search boxes cycle through example searches.
- The scrolling ticker advertises the newest coupon ticked "Show this code in the scrolling banner",
  while it's valid, with tap-to-copy.

**Download my data** (`src/server/data-export.ts`). Signed-in customers can download everything held
about them as JSON from their account page (`/account/data-export`, limited to 5 an hour).

**WhatsApp** (`src/server/whatsapp.ts`). Off by default. Uses Meta's Cloud API with four approved
templates. Messages go only to customers who ticked the opt-in at checkout, and every message is
recorded in the email log.

**Bulk packing.** Tick orders in Admin > Orders to pack and book several at once, print their packing
slips together, or download one combined courier label PDF.

**Languages: English and Hindi** (`src/i18n/`, `src/proxy.ts`).
- **Addresses.** English pages keep plain addresses (`/shop`); Hindi pages are under `/hi` (`/hi/shop`).
  Both come from the same pages in `src/app/[lang]/`. `src/proxy.ts` serves plain addresses from
  `/en/…` behind the scenes and remembers a visitor who chose Hindi (`tfd-lang` cookie), so emailed
  links open in their language. The header switch moves between the two versions of the same page.
- **Interface text.** Code is written in English: `t("Add to cart")` (from `getI18n()` in Server
  Components, `useI18n()` in Client Components). The Hindi is looked up in `src/i18n/hi.ts`, keyed by the
  English. Anything missing shows in English rather than breaking. `href("/shop")` gives the address in the
  page's language. Sentences with a link inside use `rich(t("… {link} …"), { link: <a/> })`, so Hindi can
  put the link where its word order needs. Messages from the server with numbers or names in them
  ("Only 3 left…") are matched by `HI_PATTERNS`.
- **Catalogue text.** Products, categories, collections and recipes have Hindi columns (name,
  description and so on). The owner fills them in under **Hindi version** in the admin forms; an empty
  one shows the English. Product option values (Pouch, Powder, Hot…) are translated from `hi.ts`: add
  new ones there.
- **Kept in English:** the legal policies (with a note in Hindi), emails, invoices, the admin panel, and
  link-preview images (the image renderer can't join Devanagari letters correctly).
- **Search engines** get `hreflang` links between the two versions on every page and in the sitemap.
- **Checks.** `npm test` fails if a phrase in the code has no Hindi or a `{placeholder}` differs.
  `npx tsx scripts/i18n-keys.ts` lists phrases still without Hindi. `scripts/sample-hindi.ts` holds the
  sample catalogue's Hindi and fills it into an existing development database.

**Security headers** (`src/lib/csp.ts`, `next.config.ts`, `src/proxy.ts`). Shop pages send a fixed
Content Security Policy, so they can stay pre-rendered. Admin pages send a strict one with a new
nonce per request, which Next.js adds to its own scripts. Browsers report blocked items to
`/api/csp-report`, and they appear in Admin › Site errors (extension noise is ignored). Production also
sends `Strict-Transport-Security`. An authenticator code can be used to sign in only once
(`staff_users.totp_last_step`).

**Staff 2-step verification** can be switched off with `STAFF_TWO_STEP=off` (development and demos):
staff then sign in with email and password only, and every admin page shows a warning bar. It is on
unless that variable is set, and it's switched off in this computer's `.env.local` for now.

**Caching.** Catalogue reads use `"use cache"` with tags (`catalog`, `stock`, `settings`, `reviews`),
refreshed when the admin changes something or stock moves. Personal pages render per request.

## Folder map

```
src/
  app/[lang]/(shop)/ storefront pages (English and /hi)   app/admin/   admin panel
  i18n/              languages: config, t(), Hindi text (hi.ts)
  app/api/           webhooks, cron, Google sign-in, health
  actions/           server actions (forms)  data/       request-scoped helpers (session, cart cookie, cached reads)
  server/            business logic (no Next.js APIs): orders, payments, shipping, inventory, reports…
  lib/               pure helpers: money, pricing, GST/India, crypto, TOTP
  db/                schema and client
scripts/             migrate, seed, create-staff, reset-2fa, backup, load-test
tests/               integration tests (need the farmdoor_test database)
```

## Tests

- `npm test`: unit and integration tests (see below).
- `npm run test:e2e`: a browser robot (Playwright) shops on a private copy of the store. It wipes and seeds
  `farmdoor_e2e`, builds the site with simulated payments and courier, serves it on port 3100, and
  covers paying online, a failed payment then retry, cash on delivery, form checks, an undeliverable
  pincode, buying on a phone screen, reporting a damaged item with a photo, signing in and downloading
  your data, the Hindi shop (switching and remembering the language, form checks and paying in Hindi),
  the admin panel's strict security policy, and an accessibility check (axe, WCAG 2.2 AA rules) of
  every main shop page in both languages, the cart, checkout, account, order page and search suggestions. It uses your installed Chrome locally (no download). It replaces
  the `.next` build output, so run `npm run build` before `npm start` afterwards.
- `.github/workflows/tests.yml` runs type checks, lint, both test suites on every push.

`npm test` runs unit and integration tests against `farmdoor_test` on the local Postgres. They cover
pricing and GST, coupons, stock concurrency, the full order and payment lifecycle (including duplicate
and late payments, expiry, COD, cancellation refunds, packing and delivery), webhooks, the scheduled job,
reminders and opt-outs, newsletter import, business enquiries, roles and staff safeguards, problem
reports and replacements, backup codes and one-time authenticator codes, PDF invoices, search,
scheduled sales, the data download and the Hindi translations.

`npm run load-test` simulates a festive rush (see DEPLOYMENT.md, "Load test").
