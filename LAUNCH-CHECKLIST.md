# The Farm Door: launch checklist

The store software is built and tested on this computer. **It is not live, and it isn't ready to take
real orders yet.** Payments, shipping and email all run in a clearly labelled *simulated* mode until the
real accounts below are connected and tested. The coming-soon page stays at thefarmdoor.com until then.

Technical steps are in [store/DEPLOYMENT.md](store/DEPLOYMENT.md). This list covers what you need to
decide, register, provide and check.

---

## 1. Answers still needed from you

- [ ] **Notifications and marketing (Group 7, skipped).** Do you want SMS or WhatsApp messages? Indian SMS
  needs DLT registration; WhatsApp needs a Business API provider. For now, customers confirm
  cash-on-delivery orders through an emailed link, or your team calls them and confirms in the admin.
- [ ] **Hosting and budget (Group 8, skipped).** [DEPLOYMENT.md](store/DEPLOYMENT.md) suggests a
  low-cost setup of roughly US$7/month plus free tiers. Approve it or tell me your preference.
- [ ] **Logo file**, ideally SVG or a large PNG with a transparent background. The site currently uses a
  placeholder door mark with the name in text.
- [ ] **Business type**: proprietorship, partnership, LLP or company. This affects the legal name on
  invoices and the Razorpay KYC documents.
- [ ] **FSSAI status**: which registration or licence you hold, or are applying for.
- [ ] **Sourcing**: your own farms, partner farmers or traders. This is needed for the About page and
  product descriptions.
- [ ] **Confirm one assumption.** I read your "No" on own delivery as: all orders go by courier through
  Shiprocket, with no self-delivery in Jaipur. Tell me if that's wrong.

## 2. Registrations and accounts

- [ ] **GSTIN** entered in **Admin > Settings**, with the legal name and registered address. Invoices
  can't be issued without these.
- [ ] **FSSAI** number entered in Settings. It appears in the footer and on invoices.
- [ ] **Razorpay** account and KYC. Start about 2–3 weeks before launch. Razorpay's new-merchant offer
  (0% fee for a limited period, as advertised when we checked) usually runs from activation, so
  activating close to launch gets the most from it. Confirm the current terms with Razorpay.
- [ ] **Shiprocket** account set up:
  - Jaipur pickup address saved
  - API user created
  - Tracking webhook set
  - Wallet recharged
  - Ask Shiprocket whether the rates its API returns **include GST**. If they don't, the store would
    under-charge shipping; you can cover the difference with the handling fee in Settings.
- [ ] **Business email**, e.g. orders@thefarmdoor.com, through an SMTP provider. Add the SPF, DKIM and
  DMARC records it gives you in GoDaddy DNS so order emails don't land in spam.
- [ ] **Hosting** set up: app server, database and the 5-minute scheduler (see DEPLOYMENT.md).
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
  The current catalogue is **sample data** and must not go live.
- [ ] **Product photos**: square, at least 1200 px, consistent background.
- [ ] **About page**: your story, where the spices come from, why you started.
- [ ] **Policy blanks.** These appear on the site highlighted as "[to confirm: …]":
  - Support email, phone and hours
  - Registered address
  - Dispatch time in working days
  - Refund rule for parcels returned undelivered
  - Grievance officer name and email (privacy policy)
  - Your city for the jurisdiction clause
  - Analytics or cookie use, if any

## 4. Professional review (please don't skip)

The policies and invoice format are sensible starting drafts, **not legal or tax advice**.

- [ ] **Chartered accountant** to confirm:
  - HSN codes and GST rate for each product
  - The invoice format and numbering (`TFD/26-27/00001`)
  - CGST/SGST vs IGST handling
  - How GST is charged on shipping and COD fees (currently at the GST rate of the
  order's highest-value item, treated as a composite supply)
  - Credit notes for refunds
- [ ] **Lawyer** to review the terms, privacy policy (including India's DPDP Act), shipping policy, and
  refund and cancellation policy.
- [ ] **FSSAI consultant or CA** on what must be shown on product pages and labels for selling food online.

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
- [ ] Check every email arrives (order placed, confirmed, shipped, COD confirmation, sign-in code) and
  isn't in spam.
- [ ] Check invoices for a Rajasthan address (CGST + SGST) and an out-of-state address (IGST). Show them
  to your CA.
- [ ] Sign in as each staff role and check each person sees only what they should.
- [ ] Browse and buy on a phone.
- [ ] Take a database backup and practise restoring it.

## 6. Go live

- [ ] Remove all sample products, test orders and test customers. **Or better:** start the live site on a
  fresh database and enter the real catalogue there.
- [ ] Switch to Razorpay **live** keys and the live webhook. Point the domain at the new host (DEPLOYMENT.md step 10).
- [ ] Confirm the red TEST MODE banner has **gone**. It disappears only when every provider is real.
- [ ] Place one real low-value order with your own card or UPI, follow it to delivery, then refund or
  keep it.
- [ ] Export the coming-soon newsletter sign-ups from Netlify before removing that site.
- [ ] Set up an uptime monitor on `https://thefarmdoor.com/api/health`.

## 7. First weeks after launch

- [ ] Check **Admin > Dashboard** daily. Its work queue lists what needs action: COD confirmations,
  orders to pack, delivery problems.
- [ ] Watch the daily summary email (sent after 8:00 IST) and low-stock alerts.
- [ ] Take backups on schedule.
- [ ] Download the **GST register** and **HSN summary** from **Admin > Reports** each month for your
  CA's filings.
