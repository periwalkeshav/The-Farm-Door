/**
 * Load test: how the shop copes with a festive-sale rush.
 *
 * 1. Pages: many shoppers browsing at once (home, shop, search, product pages,
 *    suggestions, cart), against a running copy of the site:
 *
 *      npm run load-test -- pages --url http://localhost:3100 --users 30 --seconds 60
 *
 * 2. Checkout: a burst of customers ordering the same item at the same moment,
 *    more than there is stock for. Checks that every order is either placed or
 *    told the item sold out, and that stock never goes below zero:
 *
 *      DATABASE_URL=postgres://…/farmdoor_e2e npm run load-test -- checkout --orders 60 --stock 40
 *
 *    This places real orders, so it only runs against a database whose name
 *    ends in _e2e (reset it afterwards with `npm run e2e:db`).
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { inventoryItems, orders, productVariants } from "@/db/schema";
import { addToCart, createCart } from "@/server/cart";
import { summarizeCart } from "@/server/checkout";
import { codConfirmToken } from "@/server/orders/common";
import { confirmCodOrder } from "@/server/orders/lifecycle";
import { placeOrder } from "@/server/orders/place";

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

function stats(ms: number[]) {
  const s = [...ms].sort((a, b) => a - b);
  const at = (p: number) => (s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0);
  return { count: s.length, p50: at(50), p95: at(95), p99: at(99), max: s.at(-1) ?? 0 };
}

const fmt = (n: number) => `${Math.round(n)} ms`;

/* ---------------- Pages ---------------- */

async function pages() {
  const base = arg("url", "http://localhost:3100").replace(/\/$/, "");
  const users = Number(arg("users", "30"));
  const seconds = Number(arg("seconds", "60"));
  const shop = await (await fetch(`${base}/shop`)).text();
  const productPaths = [...new Set([...shop.matchAll(/href="(\/products\/[a-z0-9-]+)"/g)].map((m) => m[1]))];
  if (!productPaths.length) throw new Error(`No products found at ${base}/shop. Is the site running and seeded?`);
  const searches = ["haldi", "jeera", "turmeric", "garam masala", "chilli", "cardamon", "lal mirch", "pepper"];
  const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
  const journey = () => [
    { name: "home", path: "/" },
    { name: "shop", path: "/shop" },
    { name: "suggestions", path: `/api/search?q=${encodeURIComponent(pick(searches).slice(0, 3))}` },
    { name: "search", path: `/shop?q=${encodeURIComponent(pick(searches))}` },
    { name: "product", path: pick(productPaths) },
    { name: "product", path: pick(productPaths) },
    { name: "cart", path: "/cart" },
  ];

  const timings = new Map<string, number[]>();
  const errors = new Map<string, number>();
  const until = Date.now() + seconds * 1000;
  let requests = 0;
  console.log(`Browsing ${base} with ${users} shoppers at once for ${seconds}s (no pauses between pages)…`);
  await Promise.all(
    Array.from({ length: users }, async () => {
      while (Date.now() < until) {
        for (const step of journey()) {
          if (Date.now() >= until) break;
          const started = performance.now();
          try {
            // A page that takes over 30 seconds counts as failed (shoppers give up long before).
            const res = await fetch(base + step.path, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
            await res.arrayBuffer();
            if (res.status >= 400) errors.set(`${step.name} HTTP ${res.status}`, (errors.get(`${step.name} HTTP ${res.status}`) ?? 0) + 1);
          } catch (err) {
            const key = `${step.name} ${err instanceof Error ? err.message : "error"}`;
            errors.set(key, (errors.get(key) ?? 0) + 1);
          }
          const list = timings.get(step.name) ?? [];
          list.push(performance.now() - started);
          timings.set(step.name, list);
          requests++;
        }
      }
    }),
  );
  console.log(`\n${requests} requests in ${seconds}s = ${(requests / seconds).toFixed(1)} pages per second\n`);
  console.log("page          count    median    95%      99%      slowest");
  for (const [name, ms] of timings) {
    const s = stats(ms);
    console.log(`${name.padEnd(13)} ${String(s.count).padStart(5)}  ${fmt(s.p50).padStart(8)} ${fmt(s.p95).padStart(8)} ${fmt(s.p99).padStart(8)} ${fmt(s.max).padStart(8)}`);
  }
  console.log(errors.size ? `\nErrors:\n${[...errors].map(([k, n]) => `  ${k}: ${n}`).join("\n")}` : "\nNo errors.");
}

/* ---------------- Checkout ---------------- */

async function checkout() {
  const url = process.env.DATABASE_URL ?? "";
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith("_e2e")) throw new Error(`Refusing to place test orders in "${name}". Use a database whose name ends in _e2e.`);
  const count = Number(arg("orders", "60"));
  const stock = Number(arg("stock", "40"));
  const db = getDb();

  // One pack pool, set to a known amount of stock.
  const [variant] = await db
    .select({ id: productVariants.id, poolId: productVariants.inventoryItemId, unitsPerSale: productVariants.unitsPerSale })
    .from(productVariants)
    .innerJoin(inventoryItems, eq(inventoryItems.id, productVariants.inventoryItemId))
    .where(eq(inventoryItems.unit, "PACK"))
    .limit(1);
  if (!variant) throw new Error("No pack-pool product found. Run `npm run e2e:db` first.");
  await db.update(inventoryItems).set({ onHand: stock, reserved: 0, isActive: true }).where(eq(inventoryItems.id, variant.poolId));

  // Carts are ready first, so every order is placed in the same instant.
  const carts = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const cart = await createCart(db, null);
      await addToCart(db, cart.id, variant.id, 1);
      const email = `rush-${Date.now()}-${i}@example.com`;
      const summary = await summarizeCart(db, { cartId: cart.id, couponCode: null, pincode: "302001", paymentMethod: "COD", email });
      return { cart, email, total: summary.breakdown.totalPaise! };
    }),
  );

  console.log(`${count} customers order the same item at once; there are ${stock} in stock…`);
  const outcomes = new Map<string, number>();
  const times: number[] = [];
  const placed: number[] = [];
  const started = performance.now();
  await Promise.all(
    carts.map(async ({ cart, email, total }) => {
      const t = performance.now();
      try {
        const r = await placeOrder(db, {
          cartId: cart.id,
          couponCode: null,
          signedInCustomerId: null,
          idempotencyKey: crypto.randomUUID(),
          email,
          phone: "9876543210",
          name: "Rush Tester",
          line1: "12 MG Road",
          line2: "",
          landmark: "",
          city: "Jaipur",
          state: "Rajasthan",
          pincode: "302001",
          gstin: "",
          businessName: "",
          paymentMethod: "COD",
          expectedTotalPaise: total,
          marketingOptIn: false,
          saveAddress: false,
          note: "",
        });
        const key = r.ok ? "placed" : r.code;
        outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
        if (r.ok) placed.push(r.order.id);
      } catch (err) {
        const key = `crashed: ${err instanceof Error ? err.message : String(err)}`;
        outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
      }
      times.push(performance.now() - t);
    }),
  );
  const elapsed = performance.now() - started;

  // Customers confirm their cash-on-delivery orders, also all at once.
  await Promise.all(
    placed.map(async (id) => {
      const [o] = await db.select().from(orders).where(eq(orders.id, id));
      await confirmCodOrder(db, id, { token: codConfirmToken(o) });
    }),
  );
  const [pool] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, variant.poolId));
  const s = stats(times);
  console.log(`\nAll ${count} answered in ${fmt(elapsed)} (each: median ${fmt(s.p50)}, 95% ${fmt(s.p95)}, slowest ${fmt(s.max)}).`);
  console.log(`Outcomes: ${[...outcomes].map(([k, n]) => `${k} ${n}`).join(", ")}`);
  console.log(`Stock after confirmation: ${pool.onHand} on hand, ${pool.reserved} held.`);
  const expectedPlaced = Math.min(count, Math.floor(stock / variant.unitsPerSale));
  const ok = placed.length === expectedPlaced && pool.onHand === stock - placed.length * variant.unitsPerSale && pool.reserved === 0 && ![...outcomes.keys()].some((k) => k.startsWith("crashed"));
  console.log(ok ? `\nPASS: exactly ${expectedPlaced} orders placed, the rest told it sold out, and stock adds up.` : "\nFAIL: see the numbers above.");
  if (!ok) process.exitCode = 1;
}

const mode = process.argv[2];
(mode === "pages" ? pages() : mode === "checkout" ? checkout() : Promise.reject(new Error("Usage: npm run load-test -- pages|checkout [options] (see scripts/load-test.ts)")))
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
