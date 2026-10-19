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

With Razorpay test keys, the site keeps showing the TEST MODE banner. That's deliberate.

### 5. Create your owner account
From this computer, pointing at the live database:
```bash
DATABASE_URL="postgres://…neon…?sslmode=require" npm run staff:create -- --email you@thefarmdoor.com --name "Your Name" --role OWNER
```
It prints a one-time password. Sign in at `/admin/login`, scan the QR code with an authenticator app
(Google Authenticator, Microsoft Authenticator, 1Password…), then change the password under
**My account**. Add other staff from **Admin > Staff**.

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

## Running it day to day

**Updating the code.** Push to the repository and Render rebuilds. If the update includes new files in
`drizzle/`, run `npm run db:migrate` against the live database **before** the new version goes live.

**Health.** `/api/health` returns 200 when the app and database are reachable. Add it to a free uptime
monitor (e.g. UptimeRobot, Better Stack) so you get an alert if the site goes down.

**Backups.** The Neon Free plan only lets you restore recent hours. Until you're on a paid plan with
longer history, take a dump at least weekly (daily once orders are steady) and store it somewhere safe:
```bash
pg_dump "postgres://…neon…?sslmode=require" --format=custom --file="farmdoor-$(date +%F).dump"
```
Restore into an empty database with:
```bash
pg_restore --no-owner --dbname "<new database URL>" farmdoor-YYYY-MM-DD.dump
```
Try a restore once before launch so you know it works. The admin **CSV exports** (orders, GST register,
customers) are useful records but are not a backup.

**Secrets.** If any secret leaks, generate a new one and replace it on the host and with the provider.
For Razorpay and Shiprocket, regenerate keys in their dashboards. Changing `AUTH_SECRET` signs everyone
out and invalidates email links. Changing `ENCRYPTION_KEY` means every staff member sets up 2-step
verification again.

**If payments look stuck.** The 5-minute job checks Razorpay for any order still awaiting payment before
expiring it. **Admin > Orders** shows payment status, and each order's page shows its full event history.
