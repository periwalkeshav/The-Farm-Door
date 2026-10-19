# The Farm Door: putting the coming-soon page live

This guide puts the coming-soon page on **thefarmdoor.com** (registered at GoDaddy) using **Netlify's free plan**. You can do every step in a web browser; you don't need to install anything.

## What's in the folders

| Path | What it is | Upload it? |
|---|---|---|
| `coming-soon/index.html` | The page itself: door animation, launch message and email sign-up form | Yes |
| `coming-soon/favicon.svg` | Browser tab icon | Yes |
| `coming-soon/apple-touch-icon.png` | Icon shown when someone saves the site to an iPhone home screen | Yes |
| `coming-soon/og-image.jpg` | Preview image that appears when the link is shared on WhatsApp, Instagram, Facebook or X | Yes |
| `coming-soon-assets/` | The script that generates the preview image and icon | **No**, keep this on your computer |

## Before you deploy

- [ ] **Logo:** The page currently uses a placeholder arch mark. Send me your logo file (SVG preferred, or a high-resolution PNG) and I'll swap it in and regenerate the preview image.
- [x] **Domain:** `thefarmdoor.com`. The page's link-preview settings already point to it.
- [ ] **Optional:** a contact email and Instagram handle for the footer. I left these out rather than add made-up details.

## Step 1: Create a free Netlify account

1. Go to <https://app.netlify.com/signup> and sign up. Using an email address you control long-term (ideally a business one) makes later changes easier.
2. Pick the **Free** plan when asked. You don't need to add a card.

## Step 2: Put the page online

1. Go to <https://app.netlify.com/drop> while you're logged in.
2. Drag the whole **`coming-soon`** folder from Finder onto the page.
3. After a few seconds you'll get a temporary web address like `random-name-123.netlify.app`. Open it on your phone and computer to check the page.
4. Optional: rename the site under **Project configuration → General → Change project name** (for example, `thefarmdoor`). The temporary address then becomes `thefarmdoor.netlify.app`.

## Step 3: Turn on the email sign-up form

Netlify stores the sign-ups for you, but this has to be switched on once.

1. In your Netlify site, open **Forms** and click **Enable form detection**.
2. Go to **Deploys** and drag the `coming-soon` folder onto the deploy area again. Netlify only finds the form during a new deploy.
3. Test it: enter your own email on the live page. It should appear under **Forms → notify** within a minute.
4. Optional: to get an email for every sign-up, open **Project configuration → Notifications → Form submission notifications → Add notification → Email notification**.
5. You can download the list at any time as a CSV file from **Forms → notify**.

The form ignores most spam bots using a hidden "honeypot" field that real visitors never see.

## Step 4: Connect your GoDaddy domain

### 4a. In Netlify

1. Open **Domain management → Add a domain** and enter `thefarmdoor.com`, without `www`.
2. Netlify adds both `thefarmdoor.com` and `www.thefarmdoor.com`.
3. When Netlify offers to manage your DNS, choose to **keep your DNS at GoDaddy** (external DNS). This keeps any future email set-up at GoDaddy simple.
4. Netlify will show your site's address. Note it down: it looks like `your-site-name.netlify.app`.

### 4b. In GoDaddy

**What's there now (checked on 16 Oct 2026):** `thefarmdoor.com` shows GoDaddy's default "parked" page. The main domain points to GoDaddy's parking addresses `15.197.148.33` and `3.33.130.190`, and `www` points to the main domain. There are no email (MX) records yet, so these changes won't affect any email.

1. Log in to GoDaddy and go to **My Products → thefarmdoor.com → DNS** (sometimes labelled **Manage DNS**).
2. Find the **A** record with the name **@**. It may show as "Parked" or list the parking addresses above. **Edit** it:
   - Type: `A`
   - Name: `@`
   - Value: `75.2.60.5` (Netlify's address for main domains)
   - TTL: 1 hour (or the default)
3. If any other **A** or **AAAA** records named `@` remain (for example a second parking address), delete them so only `75.2.60.5` is left.
4. Find the **CNAME** record named **www** (it usually points to `@`). **Edit** it:
   - Type: `CNAME`
   - Name: `www`
   - Value: `your-site-name.netlify.app` (the address from step 4a)
5. **Don't change** any `MX` or `TXT` records. Those are for email and verification.
6. On the same domain page, check that **Forwarding** is turned off. If it's on, it overrides these records.

GoDaddy's standard DNS can't point a main domain to a name instead of an IP address, which is why the main domain uses Netlify's IP address (`75.2.60.5`) rather than a name.

## Step 5: Turn on HTTPS (the padlock)

1. Back in Netlify, open **Domain management → HTTPS**.
2. Once DNS has updated, Netlify issues a free SSL certificate automatically. If it still shows as waiting after an hour, click **Verify DNS configuration**.
3. DNS changes usually take effect within an hour but can take up to 24–48 hours worldwide.

## Step 6: Final checks

- [ ] <https://thefarmdoor.com> and <https://www.thefarmdoor.com> both open the page with a padlock.
- [ ] The page looks right on a phone.
- [ ] A test sign-up appears under **Forms**.
- [ ] Sending the link to yourself on WhatsApp shows the preview image. WhatsApp caches previews, so if you shared the link before the image was fixed, test with a slightly different link such as `https://thefarmdoor.com/?v=2`.

## Updating the page later

Go to **Deploys** in Netlify and drag the updated `coming-soon` folder in again. Each update counts against the free plan's monthly allowance (see below), so it's best to batch changes together.

To regenerate the preview image and touch icon after changing the page or logo (needs Google Chrome installed):

```bash
python3 coming-soon-assets/build_images.py
```

## Costs and limits

| Item | Cost |
|---|---|
| Netlify Free plan | ₹0. It includes your custom domain, free SSL and unlimited form sign-ups. |
| GoDaddy | Only your yearly domain renewal. You **don't** need GoDaddy hosting, Website Builder or a GoDaddy SSL certificate, so decline those upsells. |

**How the free plan is limited:** Netlify's free plan gives you 300 "credits" a month. Each update you deploy uses 15 credits, and visitor traffic uses credits by the amount of data served. This page is small (about 30 KB per visit; the fonts come from Google, not Netlify), so the allowance should cover a very large number of visits for a pre-launch page. The limit is strict, though: if the credits ever run out, Netlify pauses the site until the next month. You can see usage under **Team → Usage & billing**. If you run paid ads to this page, check usage now and then.

**"Powered by Netlify" badge:** Since 19 August 2026, new Free-plan projects show a small Netlify badge to every visitor. Netlify adds it as the page is served; it isn't part of our page. To try turning it off, go to **Project configuration → General → Powered by Netlify badge**, switch it off and save. The change applies immediately, with no redeploy. If the Free plan doesn't let you switch it off, the paid Personal plan (US$9/month) has the badge off by default. Otherwise, leave it until the full store launches on its own hosting.

## About the email list

You're collecting email addresses with a promise to "only email you about our launch". Keep to that promise and use the list only for launch news. When we choose a newsletter tool for the real store, we'll import this list from the CSV export.

## When the real store launches

The full website will replace this page on the same domain. Only the DNS records from Step 4 change, and we'll do that together during the deployment phase.
