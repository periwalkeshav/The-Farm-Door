# The Farm Door: setting up a test copy on your computer

This guide sets up a private copy of The Farm Door online store on your own computer, so you can try
it as a shopper and as the shop owner. It takes about 20–30 minutes the first time.

**What this copy is**

- It runs only on your computer. Nobody else can see it, and nothing you do reaches real customers.
- It has **sample** products, prices, coupons and business details. They're placeholders, not the real shop.
- Payments, courier and email are **simulated**. No money moves, no parcel is booked and no email is
  sent. A red **TEST MODE** bar across the top of every page reminds you of this.
- Never type real card or bank details anywhere. The simulated payment never asks for them.

**Contents**

1. [What you need](#1-what-you-need)
2. [Unzip the project and open a terminal](#2-unzip-the-project-and-open-a-terminal)
3. [Start a database](#3-start-a-database)
4. [Install the libraries](#4-install-the-libraries)
5. [Run the setup](#5-run-the-setup)
6. [Start the store](#6-start-the-store)
7. [What to test](#7-what-to-test)
8. [Reporting a problem](#8-reporting-a-problem)
9. [Stopping, restarting and starting over](#9-stopping-restarting-and-starting-over)
10. [Automated tests (optional)](#10-automated-tests-optional)
11. [Troubleshooting](#11-troubleshooting)
12. [For the owner: preparing the copy to send](#12-for-the-owner-preparing-the-copy-to-send)

---

## 1. What you need

| What | Why | Where to get it |
|---|---|---|
| A Mac (macOS 13 or newer), Windows 10/11 or Linux computer | | |
| About 2 GB of free disk space and an internet connection | The libraries are about 650 MB | |
| **Node.js 26** (the "LTS" download) | Runs the store | [nodejs.org](https://nodejs.org) |
| **A PostgreSQL database**: Docker Desktop (any computer) **or** Postgres.app (Mac only) | Stores products, carts and orders | See step 3 |
| Google Chrome | Only for the automated browser tests in step 10 | [google.com/chrome](https://www.google.com/chrome/) |

The store was built and tested on Node.js 26. Node.js 22.12 or newer meets every library's minimum,
but only 26 has been tested.

After installing Node.js, open a **new** terminal (see step 2) and check the version:

```bash
node --version
```

It should print `v26.` followed by more numbers.

## 2. Unzip the project and open a terminal

1. Unzip the file you were sent (for example `the-farm-door-test-copy.zip`) into your **Documents**
   folder, so you get a folder called `the-farm-door` with a `store` folder inside it.
2. Open a terminal:
   - **Mac:** open **Terminal** (Applications › Utilities).
   - **Windows:** open **PowerShell** (Start menu, type "PowerShell").
   - **Linux:** open your terminal app.
3. Go into the `store` folder. **Every command in this guide runs inside `store`.**

   Mac or Linux:

   ```bash
   cd ~/Documents/the-farm-door/store
   ```

   Windows (PowerShell):

   ```powershell
   cd "$HOME\Documents\the-farm-door\store"
   ```

   If you unzipped somewhere else, use that folder's path instead.

## 3. Start a database

The store expects a PostgreSQL database on your computer, on port **54329**, with the user `postgres`.
Pick **one** of these options.

### Option A: Docker (Windows, Mac or Linux)

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and open it. Wait until
   it says Docker is running.
2. Run this once. It downloads PostgreSQL 18 (about 150 MB) and starts it:

   ```bash
   docker run --name farmdoor-db -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:54329:5432 -d postgres:18
   ```

   The database accepts connections only from your own computer (`127.0.0.1`), so it needs no password.

Later, to stop and start it again: `docker stop farmdoor-db` and `docker start farmdoor-db`.

### Option B: Postgres.app (Mac only)

1. Download [Postgres.app](https://postgresapp.com/) and drag it into your **Applications** folder.
   You don't need to open it or start its own server.
2. Start the store's private database:

   ```bash
   npm run db:start
   ```

   The first time, it creates the database files in a hidden `.pgdata` folder inside `store` and
   prints `server started`.

Later, to stop it: `npm run db:stop`. To start it again: `npm run db:start`.

### Option C: you already run PostgreSQL yourself

Skip this section unless you already know PostgreSQL. In step 5, give the setup your own connection
address. It must say `localhost` (not `127.0.0.1`), because the sample data is only ever loaded into a
local database.

Mac or Linux:

```bash
DATABASE_URL="postgres://USER:PASSWORD@localhost:5432/farmdoor" npm run setup
```

Windows (PowerShell):

```powershell
$env:DATABASE_URL="postgres://USER:PASSWORD@localhost:5432/farmdoor"; npm run setup
```

For the automated tests in step 10, also set `TEST_DATABASE_URL` (database `farmdoor_test`) and
`E2E_DATABASE_URL` (database `farmdoor_e2e`) the same way.

## 4. Install the libraries

```bash
npm ci
```

This installs the exact library versions the store was tested with, from `package-lock.json`. It takes
1–3 minutes depending on your connection.

You'll see some warnings at the end. These two are expected and safe to ignore:

- **`npm audit` … moderate severity vulnerabilities**: they're in development tools that never run on
  the live site. Don't run `npm audit fix --force`: it upgrades libraries in ways that can break things.
- **`allow-scripts` … install scripts not yet covered**: npm skips some optional install steps (esbuild,
  fsevents, unrs-resolver) as a safety measure. The store works without them.

## 5. Run the setup

```bash
npm run setup
```

This does the rest in one go:

1. Creates a settings file, `.env.local`, for your computer. It turns on the simulated payments,
   courier and email, generates fresh secret keys, and lets the admin sign in without an authenticator app.
2. Creates two databases: `farmdoor` for the store and `farmdoor_test` for the automated tests.
3. Builds the database tables and loads the sample products, categories, coupons and an owner account.
4. Writes the owner's sign-in details to a file called `DEV_CREDENTIALS.md` inside `store`.

It should finish with:

```
Setup complete. Start the store with "npm run dev" and open http://localhost:3000
```

You can run it again at any time. It keeps your settings and never deletes data.

## 6. Start the store

```bash
npm run dev
```

When it says `Ready`, open **http://localhost:3000** in your browser. Leave the terminal window open
while you test. The store stops when you close it or press **Ctrl + C**. The first visit to each page
takes a few seconds while it's prepared; after that pages are fast.

**The admin (owner's side):** open **http://localhost:3000/admin** and sign in with the email and
password in `store/DEV_CREDENTIALS.md`. Open that file in any text editor. Every computer gets its
own password. A yellow bar saying 2-step verification is switched off is expected on a test copy.

**Emails:** nothing is really sent. Every email the store would send, including the sign-in codes for
customer accounts, appears in the terminal running `npm run dev` and in **Admin › Email log**.

## 7. What to test

These are suggestions. Try anything a real customer or the owner might do, on a phone-sized window too.
To see the phone layout, use Chrome's device view: press **F12** (Mac: **Cmd + Option + I**), then click
the phone-and-tablet icon at the top left of the panel that opens.

### As a shopper

- [ ] Browse the categories, open products and switch between pack sizes. Check prices and the price per 100 g.
- [ ] Search, in English and with Hindi words such as `haldi` or `हल्दी`.
- [ ] Add items from the product cards and from product pages. Change quantities in the cart.
- [ ] Enter a delivery pincode. Any real Indian pincode works, e.g. `110001` (Delhi) or `560001`
      (Bengaluru); courier rates are simulated. `999999` shows the "can't deliver here" message.
- [ ] Try the sample coupons: `WELCOME10` (10% off orders over ₹499) and `FREESHIP` (free shipping over ₹799).
- [ ] Check out with **online payment**. A "Simulated payment" window appears instead of Razorpay:
      try **Simulate successful payment**, and also **Simulate failed payment** followed by **Pay now**
      on the order page.
- [ ] Check out with **cash on delivery**. The confirmation link the customer would receive is in
      **Admin › Email log**.
- [ ] Track an order from the "Track order" page, using the order number and your email.
- [ ] Create an account or sign in with an email address. The 6-digit code is in the terminal and the Email log.
- [ ] Switch the site to Hindi (**हिंदी** in the header, or http://localhost:3000/hi).
- [ ] Use the site with the keyboard only (Tab, Shift + Tab, Enter).

### As the owner (admin)

- [ ] Look through the Dashboard, Orders, Products, Reports and Settings.
- [ ] Confirm a cash-on-delivery order.
- [ ] **Pack an order** and open its GST invoice. For a realistic invoice, first fill in sample business
      details in **Admin › Settings**, for example legal name `Test Spices Pvt Ltd`, any address in
      Rajasthan, GSTIN `08ABCDE1234F1Z0` (a made-up number in the right format) and FSSAI number
      `12345678901234`. (The test copy lets you pack without them; the live site won't.)
- [ ] On a packed order, use **Test mode: simulate courier updates** to move the parcel through
      "in transit", "delivered" and so on, and watch the customer's order page change.
- [ ] Edit a product: change a price, the stock, or a photo, and check the shop shows the change.
- [ ] Create a coupon and use it as a shopper.
- [ ] Download a report as a spreadsheet (**Reports & exports › Download as CSV**).

## 8. Reporting a problem

For each problem, send the owner:

1. **The page address** (for example `http://localhost:3000/checkout`).
2. **What you did**, step by step, so it can be repeated.
3. **What you expected, and what happened instead.**
4. **A screenshot.**
5. **Your device and browser**, e.g. "Windows 11, Chrome", or "Mac, Safari, phone-sized window".
6. If something broke, **any red text in the terminal** running `npm run dev`. Copy and paste it.

Never send your `.env.local` or `DEV_CREDENTIALS.md` files. They contain your copy's secret keys and password.

## 9. Stopping, restarting and starting over

**To stop:** press **Ctrl + C** in the terminal running the store. Then stop the database:
`docker stop farmdoor-db` (Docker) or `npm run db:stop` (Postgres.app).

**To start again another day:** open a terminal, go into the `store` folder (step 2), then:

1. Start the database: `docker start farmdoor-db` (Docker) or `npm run db:start` (Postgres.app).
2. Run `npm run dev`.

**To start over with fresh sample data** (this deletes your test orders and accounts):

```bash
npm run db:seed -- --reset
```

It writes a new owner password to `DEV_CREDENTIALS.md`.

**When the owner sends you a newer copy:**

1. Stop the store and the database (see above).
2. Unzip the new copy into a **new** folder, e.g. `the-farm-door-2`.
3. Copy your two personal files from the old `store` folder into the new `store` folder: `.env.local`
   and `DEV_CREDENTIALS.md`. If you use Postgres.app, also copy the `.pgdata` folder. These names
   start with a dot, so they're hidden. On a Mac, press **Cmd + Shift + .** in Finder to show them.
   In Windows File Explorer, turn on **View › Show › Hidden items**.
4. In the new `store` folder: start the database, then run `npm ci`, `npm run setup` and `npm run dev`.

Your test data is kept, and `npm run setup` adds any new database changes. If you'd rather begin
fresh, skip copying the files in point 3 and run `npm run db:seed -- --reset` after the setup.

## 10. Automated tests (optional)

The store comes with automated checks. You don't need them to test by hand, but they're useful to
confirm your copy works.

**Unit tests** (about a minute):

```bash
npm test
```

All tests should pass. They use the `farmdoor_test` database, never your test shop's data.

**Browser tests** (about 5 minutes; needs Google Chrome): a robot builds a separate copy of the store
on port 3100, with its own `farmdoor_e2e` database, and shops on it in Chrome:

```bash
npm run test:e2e
```

All tests should pass. They don't touch the store you started with `npm run dev`, but stop that store
first: building the robot's copy and running `npm run dev` at the same time slows both down.

If you don't have Google Chrome, install the robot's own browser once with
`npx playwright install chromium`, then run the tests with `CI` set:

- Mac or Linux: `CI=1 npm run test:e2e`
- Windows (PowerShell): `$env:CI="1"; npm run test:e2e`

## 11. Troubleshooting

| What you see | What to do |
|---|---|
| `node` or `npm` "is not recognized" / "command not found" | Install Node.js (step 1), then close the terminal and open a new one. |
| `npm ci` says `EBADENGINE` or "Unsupported engine" | Your Node.js is too old. Install Node.js 26 and open a new terminal. |
| Windows: `npm.ps1 cannot be loaded because running scripts is disabled` | Type `npm.cmd` instead of `npm` (e.g. `npm.cmd run setup`), or use the **Command Prompt** app instead of PowerShell. |
| `Couldn't connect to PostgreSQL at localhost:54329` | The database isn't running. Start it (step 3). With Docker, check Docker Desktop is open and `docker ps` lists `farmdoor-db`. |
| Docker: `port is already allocated` | Something else is using port 54329. Stop it, or ask the owner for help using another port. |
| Docker: `The container name "/farmdoor-db" is already in use` | The database already exists: start it with `docker start farmdoor-db` instead of `docker run`. |
| Postgres.app: `initdb: No such file or directory` | Postgres.app isn't in your Applications folder. Move it there and try again. |
| `Refusing to seed a non-local database` | Your `DATABASE_URL` must say `localhost`, not `127.0.0.1` or another address. |
| `This database already has orders` | The sample data is already loaded; you don't need to load it again. To start over, see step 9. |
| `Port 3000 is in use, using available port 3001 instead` | Another program is using port 3000. Stop the store (Ctrl + C), close the other program, and run `npm run dev` again. Otherwise links in the store's emails point to the wrong address. |
| A page shows an error or stays blank | Look at the terminal running `npm run dev` for red text. Usually the database has stopped: start it and reload the page. |
| Can't sign in to the admin | Use the exact email and password from `store/DEV_CREDENTIALS.md`. After `npm run db:seed -- --reset`, the password changes. |
| Waiting for a sign-in code or order email | Nothing is really sent: look in the terminal or in **Admin › Email log**. |
| Browser tests: `Chromium distribution 'chrome' is not found` | Install Google Chrome, or use the `CI=1` route in step 10. |

If you're stuck, send the owner the command you ran and everything the terminal printed after it.

---

## 12. For the owner: preparing the copy to send

This part is for you, the person sending the copy, not the tester.

**What goes in the zip.** All the code and documents, but **none** of your private or local files:
your `.env.local` (secret keys), `DEV_CREDENTIALS.md` (your admin password), the `.pgdata` database,
`backups`, and the installed libraries (`node_modules`, `.next`). The tester's setup creates their own.

**Make the zip** (Mac, in Terminal). The command packs exactly the files the project's `.gitignore`
allows, so private files can't slip in, and puts the zip on your Desktop:

```bash
cd "/Users/keshavperiwal/Documents Local/The Farm Door" && git ls-files -co --exclude-standard | while IFS= read -r f; do [ -e "$f" ] && printf '%s\n' "$f"; done | zip -q ~/Desktop/the-farm-door-test-copy.zip -@
```

The zip is about 1.5 MB. Send it any way you like (email, Google Drive, WeTransfer) together with this
guide, which is inside it as `SETUP-FOR-TESTERS.md`.

**Before you send it:**

- The copy contains the whole store's code. Share it only with people you trust, ideally under a short
  written agreement that they won't reuse or share it.
- It contains no keys or passwords: Razorpay, Shiprocket and email accounts aren't connected, and the
  tester's setup generates its own secrets.
- Testers' admin passwords are local to their computers and can't sign in anywhere else.

**When you change the code later,** make a new zip with the same command and send it. Section 9
tells the tester how to move to the newer copy.
