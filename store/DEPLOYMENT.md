# Deploying the store

This guide takes the store from this computer to **thefarmdoor.com**. Do it in two passes: first a
private **staging** run with Razorpay *test* keys and a real Shiprocket account, then the **live** switch.
Work through [../LAUNCH-CHECKLIST.md](../LAUNCH-CHECKLIST.md) alongside it.

> **Hosting isn't decided yet.** You skipped the hosting and budget questions (Group 8). The setup below is
> a low-cost suggestion. Prices are from public pages checked in October 2026, and some come only from
> third-party summaries, so **confirm on each provider's pricing page before signing up.**

## What the store needs

| Need | Why |
|---|---|
| A Node.js 20.9+ server that stays running (not a static host) | Pages, checkout, admin and webhooks run on the server |
| PostgreSQL 16+ with daily backups | Orders, customers, stock, invoices and product images all live here |
| A scheduler that calls one URL every 5 minutes | Expires unpaid orders, checks missed payments, pulls tracking, sends daily emails |
| An SMTP email service | Order emails, sign-in codes, COD confirmation |
| HTTPS on thefarmdoor.com | Required. The app refuses to start in production on plain `http://` |

Netlify, where the coming-soon page is, hosts static sites. It can't run this store as configured.

## Suggested setup (low cost)

| Part | Suggestion | Approx. cost | Notes |
|---|---|---|---|
| App server | **Render** web service, *Starter*, Singapore region | about US$7/month | Always-on (the free tier sleeps, which breaks webhooks) |
| Database | **Neon** Postgres, Free plan, closest Asian region | ₹0 to start | 1 GB storage per project on Free. Short restore window, so add your own backups (below). Move to a paid plan once orders are flowing. |
| Scheduler | **cron-job.org** (free) | ₹0 | Supports the custom `Authorization` header the job needs |
| Email | Zoho ZeptoMail, Amazon SES, Brevo or similar | low or free tier | Any SMTP service works |

**Alternative:** Vercel Pro (about US$20/month per member) for the app, with any managed Postgres.
Vercel's free Hobby plan is meant for non-commercial use. Its scheduled jobs are limited to once a day,
so it doesn't suit this store.

Sources checked:
- [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Neon Free plan, 1 GB](https://neon.com/blog/neon-free-plan-1-gb-per-project)
- [Neon pricing](https://neon.com/pricing)
- Render prices from third-party 2026 summaries, e.g. [this one](https://www.kunalganglani.com/blog/render-vs-railway-2026). Confirm on render.com/pricing.

## Step by step (Render + Neon)

### 1. Put the code in a private Git repository
Create a **private** GitHub repository and push the `store/` folder. `.env.local`, `.pgdata/` and
`DEV_CREDENTIALS.md` are already excluded by `.gitignore`. Check they don't appear before pushing.

### 2. Create the database
1. Sign up at neon.com and create a project in the region closest to your app server.
2. Copy the **pooled** connection string. It ends with `?sslmode=require`. This is your `DATABASE_URL`.
3. From this computer, apply the tables:
   ```bash
   DATABASE_URL="postgres://…neon…?sslmode=require" npm run db:migrate
   ```
   **Never run `npm run db:seed` against the live database.** It loads the sample catalogue.

### 3. Generate secrets
Run each line once and save the output in a password manager:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"      # ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # CRON_SECRET
```
Use **new** values for the live site, not the ones in your local `.env.local`. Keep `ENCRYPTION_KEY`
stable. Changing it disconnects every staff member's authenticator app.

### 4. Create the web service
On Render, create a *Web Service* from the repository:
- Root directory: `store` (if the repository holds the whole project folder)
- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Region: Singapore. Plan: Starter.
- Health check path: `/api/health`

Add every variable from [.env.example](.env.example) under **Environment** *before the first build*.
The TEST MODE banner is decided at build time, so if you change providers or keys later, redeploy.

| Variable | Staging | Live |
|---|---|---|
| `APP_URL` | the Render URL, e.g. `https://thefarmdoor.onrender.com` | `https://thefarmdoor.com` |
| `PAYMENTS_PROVIDER` | `razorpay` with `rzp_test_…` keys | `razorpay` with `rzp_live_…` keys |
| `SHIPPING_PROVIDER` | `shiprocket` (see the note in step 7) | `shiprocket` |
| `EMAIL_TRANSPORT` | `smtp` | `smtp` |
| `ALLOW_MOCK_PROVIDERS` | not set | **not set** |
| `TRUST_CLOUDFLARE` | `true` | `true` (see below) |
| `STAFF_TWO_STEP` | not set | **not set** (`off` skips the authenticator code; local use only) |

With Razorpay test keys, the site keeps showing the TEST MODE banner. That's deliberate.

**Visitor IP addresses.** Rate limits (sign-in codes, coupon tries, checkout attempts) and the audit log
need each visitor's real IP address. Render keeps whatever a visitor puts in the `X-Forwarded-For`
header, so that header can be faked. Render's edge runs on Cloudflare, which sets `CF-Connecting-IP`
itself, so set `TRUST_CLOUDFLARE=true`. To check it after the first deploy: sign in to the admin, open
**Admin › Audit log**, and compare the IP on your `staff.login` line with what a site like
whatismyipaddress.com shows. If they differ, set `TRUST_CLOUDFLARE=false` and tell your developer.
Render doesn't document this header, so check again if you ever change host.

### 5. Create your owner account
From this computer, pointing at the live database:
```bash
DATABASE_URL="postgres://…neon…?sslmode=require" npm run staff:create -- --email you@thefarmdoor.com --name "Your Name" --role OWNER
```
It prints a one-time password. Sign in at `/admin/login`, scan the QR code with an authenticator app
(Google Authenticator, Microsoft Authenticator, 1Password…), then save the ten **backup codes** it shows
next (print them or keep them in a password manager, not on the same phone). Then change the password
under **My account**. Add other staff from **Admin > Staff**.

Then create the shop's categories (Spices, Oils, Pulses, Grains, Honey, Dry Fruits, Others, with their
Hindi names, plus the Whole / Ground / Masala blends filters inside Spices). It only adds what's missing,
so it's safe to run again:
```bash
DATABASE_URL="postgres://…neon…?sslmode=require" npm run catalog:categories
```
They stay hidden from shoppers until each has a product on sale. Rename, reorder or hide them in
**Admin > Categories & collections**.

### 6. Fill in the store settings
In **Admin > Settings**, fill in:
- Legal name, GSTIN, registered address and state
- FSSAI licence number
- Support email and phone
- Pickup pincode, box size and packaging weight
- Free-shipping threshold, COD rules
- Owner notification email

Invoices can't be issued until GSTIN, legal name and address are filled in.

### 7. Connect Razorpay
In the Razorpay Dashboard:
1. Under **Account & Settings > API Keys**, generate keys and set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
2. Under **Webhooks > Add new webhook**:
   - URL: `https://<your site>/api/webhooks/razorpay`
   - Secret: a new random value, which you also set as `RAZORPAY_WEBHOOK_SECRET`.
   - Active events: `payment.captured`, `payment.authorized`, `payment.failed`, `order.paid`,
     `refund.processed` and `refund.failed`.
3. Test mode and live mode have **separate** keys and webhooks. Set up both.

Payments are only accepted after the server fetches the payment from Razorpay and checks the amount.
A message from the browser is never trusted on its own.

### 8. Connect Shiprocket
1. Add your Jaipur pickup address under **Settings > Pickup Addresses**. Copy its nickname exactly into
   `SHIPROCKET_PICKUP_LOCATION`.
2. Under **Settings > API > Configure**, create a dedicated API user (a different email from your
   login). Set `SHIPROCKET_EMAIL` and `SHIPROCKET_PASSWORD`.
3. Under the tracking webhook settings:
   - URL: `https://<your site>/api/webhooks/courier-updates`. Shiprocket rejects URLs containing the word "shiprocket".
   - Token: a new random value, which you also set as `SHIPROCKET_WEBHOOK_TOKEN`.
4. Recharge the wallet. Shipping labels are paid from it.

Shiprocket has no sandbox. On staging, rate checks and tracking are real, but **packing an order books
a real courier**. Pack only test orders you're prepared to cancel. Cancelling the order from **Admin >
Orders** also cancels the booked shipment. Check the Shiprocket panel afterwards that no pickup is pending.

### 9. Schedule the 5-minute job
On cron-job.org, create a job:
- URL: `https://<your site>/api/cron/tick`
- Method: GET
- Schedule: every 5 minutes
- Request header: `Authorization: Bearer <CRON_SECRET>`

A successful run returns JSON. A wrong secret returns 401. The daily summary and low-stock emails go out
on the first run after 8:00 IST.

### 10. Point thefarmdoor.com at the store
Do this only after staging passes the checklist.
1. In Render, add the custom domains `thefarmdoor.com` and `www.thefarmdoor.com`. Render shows the DNS
   records it needs.
2. In GoDaddy DNS, **replace** the Netlify record (A `75.2.60.5`) and the `www` CNAME with Render's records.
3. Wait for Render to issue the certificate. Then change `APP_URL` to `https://thefarmdoor.com`, switch
   to Razorpay **live** keys and the live webhook, and redeploy.
4. Remove the custom domain from the Netlify site, or delete the site, so the two hosts don't compete for
   the domain. Keep the `coming-soon/` folder in case you need it again.
5. Update Razorpay's live webhook and Shiprocket's webhook to the final `https://thefarmdoor.com/…` URLs.

Newsletter sign-ups collected by the coming-soon page are in Netlify **Forms**. Export them as CSV
before removing the site.

### 11. Optional: Cloudflare in front (free plan)
Not needed to launch. It adds free DNS hosting, traffic and attack statistics, a firewall and one
rate-limiting rule, and caches product images close to visitors. It doesn't change what the store
does. Do it after step 10 works, on a quiet day: changing nameservers can take a few hours to settle.

1. **Add the site.** Create a free Cloudflare account, add `thefarmdoor.com` and pick the **Free**
   plan. Cloudflare copies your DNS records from GoDaddy. Compare its list with GoDaddy's record by
   record, especially:
   - **email:** MX, the SPF `TXT`, the DKIM records and `_dmarc`;
   - **verification:** any `TXT` records for Google Search Console, Razorpay or your email service.

   A missing email record means lost email.
2. **Proxy settings.** Set the email records, and any record that isn't the website, to **DNS only**
   (grey cloud). For `thefarmdoor.com` and `www`, use the two **CNAME** records Render's guide describes,
   pointing at your `….onrender.com` address, and delete any **AAAA** records. Leave them **DNS only**
   until Render shows the certificate as issued. Then switch both to **Proxied** (orange cloud).
3. **Nameservers.** In GoDaddy, change the domain's nameservers to the two Cloudflare shows. GoDaddy
   stays your registrar (renewals stay there); Cloudflare now answers for the DNS. Wait for Cloudflare
   to say the site is active.
4. **SSL/TLS.**
   - **SSL/TLS › Overview:** **Full (strict)**. Render's own guide says Full; strict also checks Render's
     certificate.
   - **Edge Certificates:** **Always Use HTTPS** on, **Minimum TLS Version** 1.2.
   - Leave Cloudflare's HSTS setting off: the store already sends it.
5. **Caching.** Keep Cloudflare's default, which caches files such as images and scripts but not
   pages, and follows the store's own instructions. Personal files (invoices, data downloads, admin
   exports, problem photos) are marked private, so they aren't cached. As a second guard, add one
   **Cache Rule** with **Bypass cache** for requests where the URI path starts with `/admin`, `/api`,
   `/account`, `/hi/account`, `/orders` or `/hi/orders`.
6. **Don't block the store's own robots.** Razorpay and Shiprocket send payment and tracking updates to
   `/api/webhooks/…`, and your 5-minute job calls `/api/cron/tick`. Challenges stop them, so:
   - keep **Security › Bots › Bot Fight Mode** off, because on the free plan it can't be told to skip
     these addresses;
   - don't use **I'm Under Attack** mode except during an actual attack;
   - in any WAF rule you add, exclude paths starting with `/api/webhooks` and `/api/cron`.
7. **Optional rate limit** (one rule on the free plan): for example, block an IP for 10 seconds when
   it makes more than 60 requests in 10 seconds to paths starting with `/api/search`.
8. **Visitor IP addresses.** Keep `TRUST_CLOUDFLARE=true` and repeat the audit-log check from step 4.
9. **Test again.** Repeat a test order, a Razorpay webhook (in Razorpay: **Webhooks › your webhook ›
   Send test**), a Shiprocket tracking update, and the cron job's JSON response.

## Security headers

Set by the store itself (nothing to configure):
- **Shop:** a Content Security Policy that allows only our own files plus Razorpay and, after a
  visitor accepts analytics cookies, Google Analytics.
- **Admin:** a stricter policy with a fresh random key (nonce) on every page. Only the panel's own
  scripts run, nothing from other sites.
- **All pages:** HTTPS-only for a year (`Strict-Transport-Security`, live site only), no framing by
  other sites, and no camera, microphone or location access.

Anything a policy blocks is listed in **Admin › Site errors** as "Security policy blocked …". One-offs
are usually a visitor's browser extension. Repeated ones after an update, or ones mentioning
`razorpay.com`, mean a provider changed an address: tell your developer. The policies are in
`src/lib/csp.ts`. Before adding `includeSubDomains` or `preload` to `Strict-Transport-Security` (in
`next.config.ts`), make sure every subdomain works over HTTPS.

## Optional extras (when you're ready)

**Google Shopping (free listings).** In Google Merchant Center, verify thefarmdoor.com and add a product
source as a scheduled fetch of `https://thefarmdoor.com/feeds/google-merchant.xml`. Products need at
least one photo to appear in the feed.

**WhatsApp order updates.**
1. Get your business verified by Meta and add a WhatsApp Business number in WhatsApp Manager.
2. Create the four message templates listed in **Admin > Settings > WhatsApp** (category Utility, the
   exact names shown) and wait for approval.
3. Create a permanent System User token.
4. Set `WHATSAPP_TRANSPORT=cloud`, `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` on the host. Check
   `WHATSAPP_GRAPH_VERSION` against Meta's changelog.
5. Redeploy and switch it on in Settings.

Only customers who tick the WhatsApp box at checkout get messages. Meta charges per message.

**Loyalty points and refer-a-friend.** Switch on and set the rates in **Admin > Settings**. Agree the
rates with your CA first: points are treated as a discount on the order they're used on.

## Running it day to day

**Updating the code.** Push to the repository and Render rebuilds. If the update includes new files in
`drizzle/`, run `npm run db:migrate` against the live database **before** the new version goes live.

**Health.** `/api/health` returns 200 when the app and database are reachable. Add it to a free uptime
monitor (e.g. UptimeRobot, Better Stack) so you get an alert if the site goes down.

**Backups.** The Neon Free plan only lets you restore recent hours, so set up the nightly backup job,
which comes with the code:
1. Create a long random passphrase and keep it in your password manager. Without it the backups can't be
   opened.
2. In GitHub, go to **Settings › Secrets and variables › Actions** and add:
   - `BACKUP_DATABASE_URL`: the live connection string (a read-only database user is best)
   - `BACKUP_PASSPHRASE`: the passphrase from step 1
3. Optional, for longer storage: free S3-compatible storage such as Cloudflare R2 or Backblaze B2. Add
   `BACKUP_S3_BUCKET`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_ACCESS_KEY_ID` and
   `BACKUP_S3_SECRET_ACCESS_KEY`, and set the bucket to delete files after about 30 days. Without a
   bucket, each backup is kept for 7 days under the workflow run. That only works while the GitHub
   repository is **private**: anyone can download a public repository's workflow files, so the job
   refuses to run there without a bucket.
4. In **Actions › Nightly database backup**, press **Run workflow** once to check it works.

Each backup is encrypted. To restore, run these two commands, in order:
```bash
gpg --decrypt farmdoor-YYYY-MM-DD.dump.gpg > farmdoor.dump
```
```bash
pg_restore --no-owner --dbname "<empty database URL>" farmdoor.dump
```
For an extra copy on your own computer, run:
```bash
DATABASE_URL="<live URL>" npm run db:backup
```
Practise a restore once before launch. The admin **CSV exports** (orders, GST register, customers) are
useful records but are not a backup.

**Locked out of the admin.** Lost your phone? Sign in with one of your backup codes ("Lost your phone?
Use a backup code" on the 2-step screen), then ask another owner to reset your 2-step verification from
**Admin > Staff**, or set it up again after a reset. If you're the only owner and have no backup codes
left, reset it from your computer against the live database, then sign in and scan the new QR code:
```bash
DATABASE_URL="<live URL>" npm run staff:reset-2fa -- --email you@thefarmdoor.com
```

**Problem reports.** Customers report damaged, wrong, expired or missing items within 48 hours of
delivery, with photos. You get an email; resolve each one in **Admin > Problem reports** (send a free
replacement, refund, or reply and close). The dashboard shows how many are open.

**Load test.** Before a big sale, check the site copes on staging. Run both against a copy, never the
live database:
```bash
npm run load-test -- pages --url https://<staging-url> --users 30 --seconds 60
DATABASE_URL="<…_e2e database URL>" npm run load-test -- checkout --orders 60 --stock 40
```
The first prints how long each kind of page takes (median, 95th and 99th percentile) and any errors.
The second places a burst of cash-on-delivery orders for one item with less stock than orders, and
checks that exactly the stock is sold and nothing goes below zero. It refuses any database whose name
doesn't end in `_e2e`.

**Site errors.** Server and browser errors are listed in **Admin > Site errors**. The owner alert email
in Settings gets at most one email an hour per error. Forward those to whoever maintains the site.

**Automatic tests.** Once the code is on GitHub, `.github/workflows/tests.yml` runs every check on each
push, including a browser robot that places test orders with simulated payments. A red cross on a commit
means something broke. Don't deploy that version.

**Secrets.** If any secret leaks, generate a new one and replace it on the host and with the provider.
For Razorpay and Shiprocket, regenerate keys in their dashboards. Changing `AUTH_SECRET` signs everyone
out and invalidates email links. Changing `ENCRYPTION_KEY` means every staff member sets up 2-step
verification again.

**If payments look stuck.** The 5-minute job checks Razorpay for any order still awaiting payment before
expiring it. **Admin > Orders** shows payment status, and each order's page shows its full event history.
