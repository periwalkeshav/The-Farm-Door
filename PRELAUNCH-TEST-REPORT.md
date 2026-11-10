# The Farm Door: pre-launch test report

Tested 23–24 October 2026 on this computer, against a production build of the store with the demo
(sample) catalogue and simulated payments, courier and email. Nothing here has been run against real
Razorpay, Shiprocket or email accounts yet: that's the staging test in LAUNCH-CHECKLIST.md, section 5.

## Summary

The store works end to end in English and Hindi, on phones, tablets and desktops. The automated tests,
the hands-on walkthroughs and an audit robot that visited every page found no crashes, broken pages,
broken images or sideways scrolling. They did find 23 smaller problems (wording, layout on narrow
phones, keyboard and screen-reader details, a few admin glitches). All 23 are fixed and re-tested: the
tests pass, the audit robot's second run found none of them, and pages load fast on a budget phone.

What still stands between this and launch is not code:

- real accounts and keys (Razorpay, Shiprocket, email), and your business details in **Admin › Settings**;
- the professional reviews (CA, lawyer, FSSAI) and a native Hindi speaker's read;
- your real catalogue and photos;
- three wording decisions listed under "Your decisions" below.

## What was tested

| Check | What it covers | Result |
|---|---|---|
| Type checks and lint | All code | Clean |
| Unit and integration tests | 163 tests: pricing and GST, coupons, stock under load, payments and refunds, Razorpay signatures and API calls, orders from placing to delivery, GST register and HSN summary exports, report date ranges, problem reports, sign-in and 2-step codes, Hindi translations, categories, data download… | All pass |
| Browser tests | 35 robot shoppers on a production build: paying online, failed payment then retry, cash on delivery, form checks, undeliverable pincode, buying on a phone, reporting a damaged item, signing in, downloading your data, the Hindi shop, the admin's security policy, accessibility of every main page | All pass |
| Dependency audit | Known vulnerabilities in packages the live site uses | None on 24 October. On 2 November a moderate advisory appeared for the email library (nodemailer 10.1.2, address parsing); updated to 10.1.7, none left. Re-run `npm audit --omit=dev` before launch |
| Hands-on, shopper (phone) | Product card dropdown → cart → pincode → coupon → checkout → cash-on-delivery order → emailed sign-in code → account | Works; 9 issues found, all fixed |
| Hands-on, owner (laptop) | Admin sign-in → orders → confirm a COD order → pack | Works; packing correctly waits for your GSTIN and legal details; 3 issues found, fixed |
| Audit robot, shop | About 300 page views: every page in the sitemap plus cart, checkout, search, sign-in and error pages, at phone (375 px), tablet and desktop sizes, in English and Hindi. Checks errors, failed requests, sideways scrolling, broken images, headings, accessibility (axe, WCAG 2.2 AA), English left on Hindi pages; full-page screenshots reviewed by eye | First run: 0 crashes, broken pages, broken images or sideways scrolling; 144 accessibility findings (contrast, headings, landmarks). Second run after fixes: 0 |
| Audit robot, admin | All 30 admin pages on phone and desktop, same checks | First run: 15 findings (tap sizes, keyboard scrolling, markup, unknown-address page). Second run: 0, apart from the test-mode banners |
| Keyboard only | Tabbing through home, shop, product, cart, checkout and the Hindi home page | "Skip to main content" is the first stop; every stop shows a focus outline |
| Speed | Ten key pages on a budget phone (4× slower processor, ~9 Mbps 4G) | Main content in 0.6–1.1 s; no layout shift |

## Issues found and fixed

**Shopping**
1. The cart's pincode box and the header's "Deliver to" didn't share the pincode. Now they do.
2. The order page's payment box said "Paid online" for orders not yet paid, and "Cash on delivery"
   twice for COD orders. It now says "Online payment" or "Cash on delivery", then a plain status
   ("Not paid yet", "Pay when it arrives", "Paid"…). The admin shows "COD · To collect".
3. The floating cart button showed with an empty cart, and on product pages it covered the sticky
   "Add to cart" bar. It now shows only when the cart has something in it, and not on product pages.
4. Pack names split across lines on narrow phones ("Bottle · 500 / ml"). Quantities now stay together.
5. The shop page was headed "Shop all spices" above honey, rice and oil. It's now "All products".
6. The example searches that cycle in the search boxes were all spices; they now include dal, oil and rice
   (each one checked to find its product, in English and Hindi).

**Phone layout**
7. Bestseller cards were cramped by the big rank numbers. The numbers are smaller on phones.
8. The seven category tiles and four "How it works" cards took a full row each on phones (about two
   screens of scrolling). They're now two to a row there.
9. On category tiles, the "→" wrapped onto a line of its own.
10. The 404 page repeated the logo below the header and left a screen of empty space.

**Accessibility (keyboard and screen readers)**
11. No "Skip to main content" link, so keyboard users tabbed through the whole header on every page.
    Added to the shop and admin.
12. The newsletter email box showed no outline when it had keyboard focus.
13. Forms showed "Enter your email address." just because focus passed through an empty field. Empty
    fields are now checked when the form is sent.
14. Pack options that aren't made in the chosen combination (e.g. a 500 ml tin) were faded to 50%, too
    faint to read (failed WCAG contrast). They now have a dashed outline and readable text.
15. The 404 page had a second "main" region inside the page's main region.
16. The two search boxes on listing pages had the same name for screen readers. They're now
    "Search the shop" and "Search and sort these products".
17. Product names on listing pages jumped from the page title straight to a third-level heading.
18. On the Hindi checkout, the state dropdown listed state names in English. Now in Hindi (the address
    still stores the English name for the courier).

**Admin**
19. Unknown admin addresses showed Next.js's bare black "404" page, and some were blank because the
    admin's security policy blocked their scripts. They now show a proper "Not found" page.
20. The packing error "Add your GSTIN… in Admin › Settings" now links to Settings.
21. Tick boxes on Categories & collections, and order links in the Email log, were smaller than the
    24 px minimum for tapping.
22. Wide tables (Reports, Audit log) couldn't be scrolled sideways with the keyboard on small screens.
23. The order page's totals list had invalid markup for screen readers.

## Your decisions

1. **Positioning wording.** The home page and site title still say "Everyday spices, delivered to your
   door", "Shop all spices" and "The Farm Door · Indian spices delivered across India", while the shop
   now also sells oils, dals, rice, honey, dry fruits and jaggery. Tell us the wording you want, or keep
   "spices" as the lead if that's the brand.
2. **Two newsletter sign-ups** sit back to back at the bottom of the home page (the home-page card, then
   the footer's). Keep both, or drop one there?
3. **Phone checkout** shows the order total only at the bottom, next to the "Place order" button. Many
   shops add a small "Order summary ₹1,330 ▾" bar at the top on phones. Worth adding?

## Known and accepted

- **Test-mode banners.** The red TEST MODE bar and the yellow "2-step verification is switched off" bar
  sit outside the page's landmark regions (a best-practice note, not a WCAG failure). Both disappear on
  the live site.
- **English on Hindi pages** that comes from your data, not the code: support email and hours, the store
  address, reviews, and recipes without Hindi text yet. The legal policies are English on purpose, with
  a Hindi note.
- **Not-found pages need JavaScript** to show their message (Next.js renders them in the browser). Every
  normal browser runs it; a visitor with JavaScript switched off would see a blank page there. Unknown
  admin addresses also answer with status 200 rather than 404; staff see the "Not found" page either way,
  and the admin is hidden from search engines.
- **Link-preview images** are English only (the image renderer can't join Hindi letters).

## Speed (budget phone)

Measured on a production build with the phone's processor slowed 4× and a ~9 Mbps / 150 ms 4G
connection. "Main content" is Largest Contentful Paint (Google counts up to 2.5 s as good); "shift" is
how much the page jumps while loading (0 is perfect).

| Page | Main content | Shift | Downloaded | of which fonts |
|---|---|---|---|---|
| Home | 0.68 s | 0 | 602 KB | 224 KB |
| Shop (all products) | 1.09 s | 0 | 653 KB | 224 KB |
| Spices category | 1.06 s | 0 | 637 KB | 224 KB |
| Product (garam masala) | 1.12 s | 0 | 652 KB | 283 KB |
| Product (mustard oil) | 1.12 s | 0 | 646 KB | 283 KB |
| Recipes | 0.56 s | 0 | 532 KB | 209 KB |
| Cart | 0.56 s | 0 | 529 KB | 209 KB |
| Checkout | 0.56 s | 0 | 540 KB | 209 KB |
| Hindi home | 1.01 s | 0 | 737 KB | 349 KB |
| Hindi product | 1.15 s | 0 | 785 KB | 407 KB |

The server ran on the same computer, so on the live host add the network round trip to the visitor
(roughly 0.1–0.3 s within India from Singapore). Still well inside "good". The biggest single item is
fonts: about 210–280 KB on English pages, and up to about 400 KB on Hindi pages, which also load the
Devanagari fonts. That's fine for launch; trimming the font files is a possible later improvement.

## How to re-run these checks

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e` (in `store/`).
- `npm audit --omit=dev` for the live site's dependencies.
- The audit robot, keyboard and speed scripts used for this report were one-off tools and aren't part
  of the store. Ask to have them added if you want to re-run this full audit before each release.
