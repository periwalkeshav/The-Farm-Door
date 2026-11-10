# The Farm Door: launch checklist

The store software is built and tested on this computer. **It is not live, and it isn't ready to take
real orders yet.** Payments, shipping and email all run in a clearly labelled *simulated* mode until the
real accounts below are connected and tested. The coming-soon page stays at thefarmdoor.com until then.

Technical steps are in [store/DEPLOYMENT.md](store/DEPLOYMENT.md). This list covers what you need to
decide, register, provide and check.

---

## Timeline (launch after Diwali)

Diwali is on Sunday 8 November 2026. Working back from a launch in the second half of November:

| When | What |
|---|---|
| By early November | Razorpay sign-up and company KYC (2–3 weeks ahead); Shiprocket account; hosting and staging set up |
| Early to mid November | Real products, photos and prices entered; CA and lawyer reviews; staging tests (section 5) |
| Before go-live | FSSAI number received and entered; contact details final; domain switched (section 6) |

## 1. Your decisions (recorded 19 October 2026)

- **Order updates:** email only at launch. COD orders are confirmed by an emailed link or by your team
  after a call. WhatsApp can be added later once Meta approves the business.
- **Marketing:** one reminder email for unpaid online orders (built; on/off in Settings), a newsletter
  checkbox at checkout (unticked), and the coming-soon list imported via **Admin > Newsletter**.
- **Advertising:** not decided. Google Analytics is built in but **off**; see section 2.
- **Extra features:** the suggested defaults (wishlist, recipes, Google Shopping later).
- **Budget:** under ₹1,000/month. The suggested hosting in DEPLOYMENT.md fits.
- **Technical upkeep:** you, with step-by-step help. You'll create the accounts and paste in the keys.
- **Business inbox:** none for now (see "Support email" in section 2).
- **Company:** Private Limited.
- **Courier:** the **cheapest** serviceable courier for each order (Admin > Settings > Shipping).
  Shiprocket compares all its partners for the pincode, including Blue Dart, which is DHL Group's
  courier for deliveries inside India.

Still to come from you: **logo file**, **sourcing story** (About page), and the **FSSAI number** once issued.

## 2. Registrations and accounts

- [ ] **Company details** in **Admin > Settings**:
  - Legal name, exactly as on the incorporation certificate ("… Private Limited")
  - CIN
  - GSTIN
  - Registered address and state

  Invoices can't be issued without these. Ask your CA whether the CIN must also appear on invoices and the
  website; the store shows it on both once entered.
- [ ] **FSSAI.** Your application has started. You'll need the number before selling food, so treat it as
  a launch blocker. Confirm with your consultant whether a registration or a licence applies. The number
  goes in Settings and appears in the footer and on invoices.
- [ ] **Razorpay** account and KYC, by early November. For a company, Razorpay typically asks for:
  - Certificate of incorporation
  - Company PAN
  - GST certificate
  - A director's ID
  - A current account in the company's name

  Razorpay shows the exact list. Its new-merchant 0% offer (as advertised when we checked) usually runs
  from activation, so don't activate much earlier than needed. Confirm the current terms with Razorpay.
- [ ] **Shiprocket** account set up:
  - Jaipur pickup address saved
  - API user created
  - Tracking webhook set
  - Wallet recharged
  - Ask Shiprocket whether the rates its API returns **include GST**. If they don't, the store would
    under-charge shipping; you can cover the difference with the handling fee in Settings.
- [ ] **Sending email.** An SMTP service sends order emails from orders@thefarmdoor.com; it only needs
  DNS records (SPF, DKIM, DMARC) in GoDaddy, not an inbox.
- [ ] **Support email.** You chose no domain inbox for now. Enter an address you already check, such as
  your Gmail, as the support email in Settings. Customer replies to order emails go there automatically.
- [ ] **Hosting** set up: app server, database and the 5-minute scheduler (see DEPLOYMENT.md).
- [ ] **Nightly backups** switched on: add the two backup secrets in GitHub and run the backup job once
  (DEPLOYMENT.md › Running it day to day).
- [ ] **Owner alert email** in **Admin > Settings > Store alerts**. Order alerts, daily summaries and
  site error alerts go there.
- [ ] *Optional:* **Google Analytics.** If you want visitor statistics:
  1. Create a free Google Analytics property.
  2. Paste its measurement ID (G-…) into **Admin > Settings > Analytics**.

  Visitors then see a cookie banner, analytics only runs if they accept, and the privacy policy updates
  itself. Leave it empty for no tracking at all.
- [ ] *Optional:* **Google Search Console** (free). Verify thefarmdoor.com with a DNS record in GoDaddy
  after launch, then submit `https://thefarmdoor.com/sitemap.xml`.
- [ ] *Optional:* **Google sign-in**: a Google Cloud OAuth client with
  `https://thefarmdoor.com/api/auth/google/callback` as the redirect URL.

## 3. Content to provide

- [ ] **Real product list.** For each product and pack size:
  - Name and description
  - Variants (form, heat, size)
  - MRP and selling price
  - Net weight and shipping weight
  - HSN code and GST rate
  - Stock

  The current catalogue is **sample data** and must not go live. The quickest way to enter it: **Admin >
  Products > Import / export spreadsheet**. Download the template, fill it in Excel or Google Sheets (one
  row per pack size), check it, then import.
- [ ] **Hindi text for the catalogue.** For each product, fill in **Hindi version** on its admin page (name,
  short subtitle, description, ingredients, how to use, storage). Do the same in **Admin > Categories &
  collections**, and for any recipes. Empty boxes show the English on the Hindi shop, so you can do the
  bestsellers first. The sample products' Hindi is sample text like the rest of the sample data.
- [ ] **Product photos**: square, at least 1200 px, consistent background.
- [ ] **About page**: your story, where the spices come from, why you started.
- [ ] *Optional:* **A few recipes** (Admin > Recipes) using your spices. They bring visitors from Google
  and link straight to the products.
- [ ] *Optional:* **Gift boxes** for festivals. Create the box as a product, then record what's inside
  and make up boxes under Admin > Inventory.
- [ ] **Real contact details.** The test store uses **dummy** ones (support@example.com,
  +91 00000 00000). The live site starts with a fresh database, and the admin dashboard keeps listing
  them under "Before launch" until real ones are entered.
- [ ] **Social links** (Instagram, Facebook, YouTube) in Settings, if you have them. They appear in the
  footer only when filled in.
- [ ] **Policy blanks.** These appear on the site highlighted as "[to confirm: …]":
  - Registered address
  - Dispatch time in working days
  - Refund rule for parcels returned undelivered
  - Grievance officer name and email (privacy policy)
  - Your city for the jurisdiction clause

### Shop set-up in the admin
- [ ] Create the categories with `npm run catalog:categories` (DEPLOYMENT.md step 5), then put each real
  product in one: Spices, Oils, Pulses, Grains, Honey, Dry Fruits or Others. For spices, also tick the right
  filter collection (Whole spices, Ground spices or Masala blends).
- [ ] For oils (and anything else sold by the litre), set **Sold by: Volume** under the product's
  **Details** before entering the pack sizes, so prices show per 100 ml and sizes as ml / L.
- [ ] Create "Shop by dish" collections (for example Biryani, Masala chai, Everyday tadka). Add the
  right spices and tick **In "Shop by dish"** in **Admin > Categories & collections**.
- [ ] Keep the **Bestsellers** collection (web address `bestsellers`) up to date. It shows with rank
  numbers on the home page.
- [ ] Optional: tick **Show this code in the scrolling banner** on a launch coupon.
- [ ] Add your **FSSAI licence number** in Settings. It then appears in the trust strip on every product page.

## 4. Professional review (please don't skip)

The policies and invoice format are sensible starting drafts, **not legal or tax advice**.

- [ ] **Chartered accountant** to confirm:
  - HSN codes and GST rate for each product
  - The invoice format and numbering (`TFD/26-27/00001`)
  - CGST/SGST vs IGST handling
  - How GST is charged on shipping and COD fees (currently at the GST rate of the
  order's highest-value item, treated as a composite supply)
  - Credit notes for refunds
  - **If you turn on loyalty points or refer-a-friend:** the rates, and treating points as a discount
    on the order they're used on
  - **If you sell gift boxes:** which GST rate applies to a box of mixed items
  - **Free replacements** for damaged or wrong items: the store sends them as a ₹0 order with no tax
    invoice (the courier is given the original invoice number). Ask whether you need a delivery challan
    or anything else for these.
  - **Sales:** a sale lowers the selling price, so the invoice shows the sale price. Confirm that's fine,
    and that showing MRP crossed out next to it is acceptable
  - The **PDF invoice** attached to the "shipped" email: amounts are shown as "Rs." (the PDF fonts have no
    ₹ sign), and text in non-Latin scripts (say, a Hindi address) shows as "?" in the PDF only.
- [ ] **Lawyer** to review the terms, privacy policy (including India's DPDP Act), shipping policy, and
  refund and cancellation policy.
- [ ] **FSSAI consultant or CA** on what must be shown on product pages and labels for selling food online.
- [ ] **A native Hindi speaker** to read the Hindi shop (`/hi`) on staging, or the file
  `store/src/i18n/hi.ts`, which lists every English phrase with its Hindi. The translations are a careful
  first draft in everyday Hindi, not checked by a native speaker yet. The legal policies stay in English on
  the Hindi shop (with a note in Hindi); translate them only together with your lawyer.

## 5. Test on staging (before the domain switch)

Use Razorpay **test** keys, the real Shiprocket account and real email (see DEPLOYMENT.md).

- [ ] Place prepaid orders: one paid successfully, one failed then retried, one abandoned. The abandoned
  order should cancel itself and its stock should return.
- [ ] Check the Razorpay webhook shows as delivered in the Razorpay dashboard.
- [ ] Refund one paid order from the admin. Check the refund status updates.
- [ ] Place a COD order. Confirm it from the email link. Also confirm one from the admin.
- [ ] Check shipping rates for a few pincodes (Jaipur, Mumbai, a north-east pincode, an unserviceable one).
- [ ] Pack one test order to see the real invoice and label, then **cancel it from the admin** and check
  in Shiprocket that the pickup is cancelled.
- [ ] Check every email arrives and isn't in spam:
  - Order placed, confirmed and shipped (with the PDF invoice attached)
  - COD confirmation
  - Sign-in code
  - Unpaid-order reminder
  - Business enquiry

  Reply to one and check the reply reaches your support email.
- [ ] Check invoices for a Rajasthan address (CGST + SGST) and an out-of-state address (IGST). Show them
  to your CA.
- [ ] Send a test enquiry from **Bulk & business orders** and update it in **Admin > Business enquiries**.
- [ ] On a delivered test order, **report a problem** with a phone photo. In **Admin > Problem reports**,
  send a replacement for one report (then pack it) and refund another.
- [ ] Schedule a short **sale** in **Admin > Sales** and check the price changes on product pages, in the
  cart and at checkout when it starts and ends.
- [ ] Save your 2-step **backup codes**, then sign in once with one of them to check it works.
- [ ] Download your data from a test customer account (**Account > Download my data**).
- [ ] Switch to **हिंदी** in the header and place one test order in Hindi. Check that the language is
  remembered when you open a link from an email.
- [ ] Check **Admin › Audit log** shows your real IP address on your sign-in (DEPLOYMENT.md, "Visitor IP
  addresses").
- [ ] Open **Admin › Site errors** after the tests: nothing should say "Security policy blocked".
- [ ] Share a product link and the home page on WhatsApp and check the preview image appears.
- [ ] Run the **load test** against staging (DEPLOYMENT.md, "Load test").
- [ ] Sign in as each staff role and check each person sees only what they should.
- [ ] Browse and buy on a phone.
- [ ] Take a database backup and practise restoring it.

## 6. Go live

- [ ] Remove all sample products, test orders and test customers. **Or better:** start the live site on a
  fresh database and enter the real catalogue there.
- [ ] Switch to Razorpay **live** keys and the live webhook. Point the domain at the new host (DEPLOYMENT.md step 10).
- [ ] Confirm the red TEST MODE banner has **gone**. It disappears only when every provider is real.
- [ ] Confirm the admin's yellow "2-step verification is switched off" bar is **not** showing, i.e.
  `STAFF_TWO_STEP` isn't set on the live site. It's switched off on the development computer for now.
- [ ] Place one real low-value order with your own card or UPI, follow it to delivery, then refund or
  keep it.
- [ ] Download the coming-soon sign-ups from Netlify Forms (CSV) and import them in **Admin > Newsletter**
  before removing that site. They agreed to launch news only: send them the launch announcement with an
  invitation to subscribe, not regular offers.
- [ ] Set up an uptime monitor on `https://thefarmdoor.com/api/health`.
- [ ] *Optional, after launch week:* put Cloudflare's free plan in front (DEPLOYMENT.md step 11).

## 7. First weeks after launch

- [ ] Check **Admin > Dashboard** daily. Its work queue lists what needs action: COD confirmations,
  orders to pack, delivery problems and new business enquiries.
- [ ] Watch the daily summary email (sent after 8:00 IST) and low-stock alerts.
- [ ] Check **Admin > Site errors** once a day, and the nightly backup job in GitHub once a week.
- [ ] *Optional:* add the Google Shopping feed in Google Merchant Center (free listings).
- [ ] *Later:* WhatsApp order updates, loyalty points and refer-a-friend are built in and switched off.
  Turn them on in Settings when you're ready (WhatsApp needs Meta's approval first).
- [ ] Download the **GST register** and **HSN summary** from **Admin > Reports** each month for your
  CA's filings.
