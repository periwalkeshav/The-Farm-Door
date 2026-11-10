import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DoorIllustration } from "@/components/shop/door-illustration";
import { HeroCarousel, type Slide } from "@/components/shop/hero-carousel";
import { NewsletterForm } from "@/components/shop/newsletter-form";
import { ProductGrid } from "@/components/shop/product-card";
import { BayLeaf, Cardamom, Chilli, Cinnamon, Clove, HoneyJar, Lentils, MortarPestle, Nuts, OilBottle, Parcel, Peppercorns, Pot, SpiceMound, SpiceSacks, StarAnise, Van, Wheat } from "@/components/shop/spice-art";
import { Container, LinkButton, SectionHeading, Stars } from "@/components/ui";
import { getCategories, getHomeCollections, getPublicSettings, getRunningSale, getShopByCollections, getTestimonials } from "@/data/catalog";
import { getRecipes } from "@/data/recipes";
import { formatINR } from "@/lib/money";
import { dateLocale } from "@/i18n/config";
import { alternates, getI18n } from "@/i18n/server";

const CATEGORY_STYLES = ["bg-[#F3E3BC]", "bg-[#F2D6C8]", "bg-[#E5ECDC]", "bg-[#EBDCCB]"];

/** Which drawing suits a category, from words in its (English) web address. Anything else gets a parcel. */
function categoryKind(slug: string) {
  const n = slug.toLowerCase();
  if (/oil/.test(n)) return "oil";
  if (/honey/.test(n)) return "honey";
  if (/grain|rice|millet|wheat|atta/.test(n)) return "grain";
  if (/pulse|dal|lentil|bean/.test(n)) return "pulse";
  if (/dry|nut|fruit/.test(n)) return "nuts";
  if (/blend|masala/.test(n)) return "blend";
  if (/ground|powder/.test(n)) return "ground";
  if (/spice|whole/.test(n)) return "spice";
  return "other";
}

/** A small drawing for a category tile. */
function CategoryArt({ slug }: { slug: string }) {
  const kind = categoryKind(slug);
  const art =
    kind === "blend" ? (
      <MortarPestle className="w-24" />
    ) : kind === "ground" ? (
      <div className="flex items-end gap-1">
        <SpiceMound className="w-20" />
        <SpiceMound className="w-14" color="#C23B26" shade="#8E2A1A" />
      </div>
    ) : kind === "spice" ? (
      <div className="relative h-20 w-28">
        <StarAnise className="absolute top-0 left-0 w-14" />
        <Cinnamon className="absolute right-0 bottom-2 w-20 rotate-[-18deg]" />
        <Cardamom className="absolute bottom-0 left-6 w-10 rotate-12" />
      </div>
    ) : kind === "oil" ? (
      <OilBottle className="h-24 w-auto" />
    ) : kind === "honey" ? (
      <HoneyJar className="h-20 w-auto" />
    ) : kind === "grain" ? (
      <Wheat className="h-24 w-auto" />
    ) : kind === "pulse" ? (
      <Lentils className="w-24" />
    ) : kind === "nuts" ? (
      <Nuts className="w-24" />
    ) : (
      <Parcel className="w-20" />
    );
  return <div className="pointer-events-none shrink-0 opacity-90 transition duration-500 group-hover:-translate-y-1 group-hover:rotate-3">{art}</div>;
}

/** Round picture for a category in the icon row under the banner. */
function CategoryIcon({ slug }: { slug: string }) {
  switch (categoryKind(slug)) {
    case "blend":
      return <MortarPestle className="w-14" />;
    case "ground":
      return <SpiceMound className="w-16" />;
    case "spice":
      return <StarAnise className="w-14" />;
    case "oil":
      return <OilBottle className="h-14 w-auto" />;
    case "honey":
      return <HoneyJar className="h-12 w-auto" />;
    case "grain":
      return <Wheat className="h-14 w-auto" />;
    case "pulse":
      return <Lentils className="w-14" />;
    case "nuts":
      return <Nuts className="w-14" />;
    default:
      return <Parcel className="w-12" />;
  }
}

const ICON_BACKGROUNDS = ["bg-[#F3E3BC]", "bg-[#F2D6C8]", "bg-[#E5ECDC]", "bg-[#EBDCCB]"];

const PROMISE_ICONS: Record<string, ReactNode> = {
  delivery: <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM17 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />,
  secure: <path d="M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5zM12 15v2" />,
  cod: <path d="M3 7h18v10H3zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6 10v4M18 10v4" />,
  track: <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />,
};

/** One banner slide: words on the left, a picture on the right. */
function SlideLayout({ tone, bg, eyebrow, title, text, actions, art, heading = "h2" }: { tone: "light" | "dark"; bg: string; eyebrow: string; title: ReactNode; text: ReactNode; actions: ReactNode; art: ReactNode; heading?: "h1" | "h2" }) {
  const H = heading;
  return (
    <div className={`h-full ${bg}`}>
      <Container className="grid h-full items-center gap-8 pt-12 pb-24 sm:pt-16 lg:grid-cols-[1.1fr_.9fr] lg:pt-20">
        <div>
          <p className={`mb-4 inline-flex rounded-full border px-3 py-1.5 text-xs font-bold tracking-[.14em] uppercase ${tone === "dark" ? "border-ivory/25 text-ivory" : "border-line bg-paper/70 text-forest"}`}>{eyebrow}</p>
          <H className={`text-5xl leading-[1.04] font-medium sm:text-6xl ${tone === "dark" ? "text-ivory" : ""}`}>{title}</H>
          <p className={`mt-5 max-w-xl text-lg leading-relaxed ${tone === "dark" ? "text-ivory/85" : "text-muted"}`}>{text}</p>
          <div className="mt-8 flex flex-wrap gap-3">{actions}</div>
        </div>
        <div className="relative">{art}</div>
      </Container>
    </div>
  );
}

/** Spices drifting gently around a picture. */
function Floating({ children }: { children: ReactNode }) {
  const bits: { el: ReactNode; className: string; delay: string; duration: string; tilt: string }[] = [
    { el: <StarAnise className="w-full" />, className: "top-[6%] left-[2%] w-14 sm:w-16", delay: "0s", duration: "7s", tilt: "-8deg" },
    { el: <Chilli className="w-full" />, className: "top-[38%] -right-[2%] w-24 sm:w-28", delay: "-2s", duration: "8s", tilt: "-20deg" },
    { el: <Cardamom className="w-full" />, className: "bottom-[16%] left-[4%] w-12", delay: "-4s", duration: "6s", tilt: "18deg" },
    { el: <BayLeaf className="w-full" />, className: "top-[2%] right-[8%] w-20", delay: "-1s", duration: "9s", tilt: "24deg" },
    { el: <Clove className="w-full" />, className: "bottom-[30%] right-[10%] w-5", delay: "-3s", duration: "5.5s", tilt: "-30deg" },
    { el: <Peppercorns className="w-full" />, className: "bottom-[4%] right-[22%] w-12", delay: "-5s", duration: "6.5s", tilt: "0deg" },
  ];
  return (
    <div className="relative">
      {children}
      {bits.map((b, i) => (
        <div
          key={i}
          className={`float pointer-events-none absolute ${b.className}`}
          style={{ "--float-delay": b.delay, "--float-duration": b.duration, "--tilt": b.tilt } as React.CSSProperties}
        >
          {b.el}
        </div>
      ))}
    </div>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const { lang } = await getI18n();
  return { alternates: alternates(lang, "/") };
}

export default async function HomePage() {
  const { lang, t, href } = await getI18n();
  const [categories, collections, testimonials, { cod, store, shipping }, sale, recipes, dishes] = await Promise.all([
    getCategories(lang),
    getHomeCollections(lang),
    getTestimonials(lang),
    getPublicSettings(),
    getRunningSale(),
    getRecipes(lang),
    getShopByCollections(lang),
  ]);
  const city = t(store.city || "India");

  const promises = [
    { icon: "delivery", title: t("Delivery across India"), text: t("Live courier rates and delivery dates for your pincode, shown before you pay.") },
    { icon: "secure", title: t("Secure payments"), text: t("UPI, cards and net banking through Razorpay. We never see your card details.") },
    cod.enabled ? { icon: "cod", title: t("Cash on delivery"), text: t("Prefer to pay at the door? Choose cash on delivery at checkout.") } : null,
    { icon: "track", title: t("Track every order"), text: t("Follow your parcel from our door to yours, with email updates.") },
  ].filter(Boolean) as { icon: string; title: string; text: string }[];

  const slides: Slide[] = [
    {
      id: "welcome",
      label: t("Everyday spices, delivered"),
      tone: "light",
      content: (
        <SlideLayout
          tone="light"
          bg="bg-ivory"
          heading="h1"
          eyebrow={t("Indian spices & pantry essentials")}
          title={
            <>
              {t("Everyday spices, delivered to")} <em className="font-normal text-saffron-deep">{t("your door.")}</em>
            </>
          }
          text={t("Whole spices, ground spices and masala blends, shipped from {city} to every corner of India.", { city })}
          actions={
            <>
              <LinkButton href={href("/shop")} size="lg">
                {t("Shop all spices")}
              </LinkButton>
              <LinkButton href={href("/collections/bestsellers")} size="lg" variant="secondary">
                {t("See bestsellers")}
              </LinkButton>
            </>
          }
          art={
            <Floating>
              <DoorIllustration className="px-10 sm:px-16 lg:px-6" />
            </Floating>
          }
        />
      ),
    },
  ];
  if (sale) {
    slides.push({
      id: "sale",
      label: t("{name}, {percent}% off", { name: sale.name, percent: sale.percent }),
      tone: "light",
      content: (
        <SlideLayout
          tone="light"
          bg="bg-[#F6E1DA]"
          eyebrow={t("On now · ends {date}", { date: sale.endsAt.toLocaleDateString(dateLocale(lang), { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) })}
          title={
            <>
              {sale.name}: <span className="text-chilli">{t("{percent}% off", { percent: sale.percent })}</span> {t(sale.scope === "ALL" ? "everything" : "selected spices")}
            </>
          }
          text={t("Sale prices are already in the shop. Coupons and points still work on top.")}
          actions={
            <LinkButton href={href("/shop")} size="lg">
              {t("Shop the sale")}
            </LinkButton>
          }
          art={
            <div className="relative mx-auto grid aspect-square w-full max-w-[360px] place-items-center">
              <StarAnise className="spin-slow absolute inset-[6%] opacity-25" />
              <div className="grid size-44 place-items-center rounded-full bg-chilli text-center text-white shadow-[0_24px_50px_-24px_rgba(181,65,44,.8)] sm:size-52">
                <p className="font-display text-6xl leading-none font-semibold sm:text-7xl">
                  {sale.percent}%<span className="mt-1 block text-lg font-bold tracking-[.2em] uppercase">{t("off")}</span>
                </p>
              </div>
              <Chilli className="float absolute top-[8%] right-0 w-28" style={{ "--tilt": "-24deg" } as React.CSSProperties} />
              <Cinnamon className="float absolute bottom-[10%] left-0 w-28" style={{ "--float-delay": "-2s", "--tilt": "12deg" } as React.CSSProperties} />
            </div>
          }
        />
      ),
    });
  }
  if (shipping.freeShippingThresholdPaise !== null) {
    slides.push({
      id: "shipping",
      label: t("Free shipping"),
      tone: "light",
      content: (
        <SlideLayout
          tone="light"
          bg="bg-[#E5ECDC]"
          eyebrow={t("Delivering across India")}
          title={t("Free shipping on orders over {amount}", { amount: formatINR(shipping.freeShippingThresholdPaise) })}
          text={t("Below that, you pay the courier's real rate for your pincode, shown with a delivery date before you pay.")}
          actions={
            <LinkButton href={href("/shop")} size="lg">
              {t("Start shopping")}
            </LinkButton>
          }
          art={
            <div className="relative mx-auto aspect-[4/3] w-full max-w-[420px]">
              <svg viewBox="0 0 400 300" className="absolute inset-0 size-full" aria-hidden="true">
                <circle cx="300" cy="80" r="46" fill="#F0C46A" opacity=".7" />
                <path d="M0 230C90 200 180 210 260 226S360 240 400 230V300H0Z" fill="#B9C99E" />
                <path d="M0 252C100 236 220 240 400 252V300H0Z" fill="#8FA77A" />
                <path className="road" d="M10 270H390" stroke="#F7F2E8" strokeWidth="5" strokeLinecap="round" />
              </svg>
              <Van className="drive absolute bottom-[14%] left-[22%] w-[52%]" />
              <Parcel className="float absolute top-[8%] left-[6%] w-[22%]" style={{ "--tilt": "-6deg" } as React.CSSProperties} />
            </div>
          }
        />
      ),
    });
  }
  if (recipes.length > 0) {
    slides.push({
      id: "recipes",
      label: t("Recipes"),
      tone: "light",
      content: (
        <SlideLayout
          tone="light"
          bg="bg-sand"
          eyebrow={t("From our kitchen")}
          title={t("Cook with our spices")}
          text={t("Everyday Indian recipes, each with the spices it needs, ready to add to your cart.")}
          actions={
            <LinkButton href={href("/recipes")} size="lg">
              {t("Browse recipes")}
            </LinkButton>
          }
          art={
            <div className="relative mx-auto aspect-[4/3] w-full max-w-[400px]">
              <Pot className="absolute inset-x-[14%] bottom-[6%]" />
              <BayLeaf className="float absolute top-[4%] left-[2%] w-24" style={{ "--tilt": "-18deg" } as React.CSSProperties} />
              <StarAnise className="float absolute top-[10%] right-[6%] w-14" style={{ "--float-delay": "-3s" } as React.CSSProperties} />
            </div>
          }
        />
      ),
    });
  }
  slides.push({
    id: "bulk",
    label: t("Bulk and business orders"),
    tone: "dark",
    content: (
      <SlideLayout
        tone="dark"
        bg="bg-forest"
        eyebrow={t("For businesses")}
        title={t("Buying for a restaurant, caterer or shop?")}
        text={t("Tell us what you need and we'll reply with prices and availability. GST invoices for every order.")}
        actions={
          <LinkButton href={href("/bulk-orders")} size="lg" variant="saffron">
            {t("Send a bulk enquiry")}
          </LinkButton>
        }
        art={
          <div className="relative mx-auto aspect-[4/3] w-full max-w-[420px]">
            <SpiceSacks className="absolute inset-x-[8%] bottom-[4%]" />
            <Peppercorns className="float absolute top-[8%] left-[10%] w-16" />
            <Clove className="float absolute top-[4%] right-[16%] w-6" style={{ "--float-delay": "-2s", "--tilt": "20deg" } as React.CSSProperties} />
          </div>
        }
      />
    ),
  });

  const strip = [StarAnise, Chilli, Cardamom, Cinnamon, BayLeaf, Peppercorns, Clove, SpiceMound];
  const stripRow = (copy: boolean) => (
    <div className={`flex shrink-0 items-center gap-14 pr-14 ${copy ? "ticker-copy" : ""}`} aria-hidden="true">
      {strip.map((Art, i) => (
        <Art key={i} className={i % 3 === 0 ? "h-12 w-auto" : "h-9 w-auto"} />
      ))}
    </div>
  );

  return (
    <>
      <HeroCarousel slides={slides} />

      {categories.length > 0 && (
        <nav aria-label={t("Categories")} className="border-t border-line">
          <Container>
            {/* Centred when all the icons fit; otherwise it scrolls, starting from the first one. */}
            <ul className="-mx-4 flex snap-x gap-5 overflow-x-auto px-4 py-6 [scrollbar-width:none] sm:gap-8 [&>li:first-child]:ml-auto [&>li:last-child]:mr-auto">
              {categories.map((c, i) => (
                <li key={c.id} className="snap-start">
                  <Link href={href(`/category/${c.slug}`)} className="group flex w-24 flex-col items-center gap-2 text-center">
                    <span className={`grid size-20 place-items-center rounded-full border-2 border-transparent transition duration-300 group-hover:-translate-y-1 group-hover:border-forest/30 sm:size-24 ${ICON_BACKGROUNDS[i % ICON_BACKGROUNDS.length]}`}>
                      <CategoryIcon slug={c.slug} />
                    </span>
                    <span className="text-sm font-semibold text-forest group-hover:underline">{c.name}</span>
                  </Link>
                </li>
              ))}
              {recipes.length > 0 && (
                <li className="snap-start">
                  <Link href={href("/recipes")} className="group flex w-24 flex-col items-center gap-2 text-center">
                    <span className="grid size-20 place-items-center rounded-full border-2 border-transparent bg-sand transition duration-300 group-hover:-translate-y-1 group-hover:border-forest/30 sm:size-24">
                      <Pot className="w-14" />
                    </span>
                    <span className="text-sm font-semibold text-forest group-hover:underline">{t("Recipes")}</span>
                  </Link>
                </li>
              )}
              <li className="snap-start">
                <Link href={href("/shop")} className="group flex w-24 flex-col items-center gap-2 text-center">
                  <span className="grid size-20 place-items-center rounded-full border-2 border-dashed border-forest/40 bg-paper text-forest transition duration-300 group-hover:-translate-y-1 group-hover:border-forest sm:size-24">
                    <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                  <span className="text-sm font-semibold text-forest group-hover:underline">{t("All products")}</span>
                </Link>
              </li>
            </ul>
          </Container>
        </nav>
      )}

      <section className="border-y border-line bg-paper">
        <Container className={`grid gap-6 py-8 sm:grid-cols-2 ${promises.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          {promises.map((p) => (
            <div key={p.title} className="group flex gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sand text-forest transition duration-300 group-hover:-translate-y-0.5 group-hover:bg-saffron/30">
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {PROMISE_ICONS[p.icon]}
                </svg>
              </span>
              <div>
                <p className="font-display text-lg font-semibold text-forest">{p.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{p.text}</p>
              </div>
            </div>
          ))}
        </Container>
      </section>

      {categories.length > 0 && (
        <Container className="py-14">
          <div className="reveal">
            <SectionHeading eyebrow={t("Browse")} title={t("Shop by category")} />
          </div>
          {/* Two to a row on phones (descriptions from tablets up), so seven categories don't take two screens. */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {categories.map((c, i) => (
              <Link
                key={c.id}
                href={href(`/category/${c.slug}`)}
                className={`reveal group flex flex-col rounded-[var(--radius-card)] border border-line p-4 transition hover:-translate-y-1 hover:shadow-[0_18px_40px_-28px_rgba(31,59,45,.55)] sm:p-6 ${CATEGORY_STYLES[i % CATEGORY_STYLES.length]}`}
              >
                <p className="font-display text-xl font-semibold text-forest sm:text-2xl">{c.name}</p>
                <p className="mt-2 hidden text-sm leading-relaxed text-ink/75 sm:block">{c.description}</p>
                <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                  {/* The arrow stays with the last word rather than wrapping on its own. */}
                  <p className="text-sm font-bold text-forest group-hover:underline">{t("Shop {name} →", { name: c.name.toLowerCase() }).replace(/ →$/, "\u00a0→")}</p>
                  <div className="origin-bottom-right scale-75 sm:scale-100">
                    <CategoryArt slug={c.slug} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Container>
      )}

      {collections
        .filter((c) => c.products.length > 0)
        .map((c, i) => (
          <Container key={c.id} className="reveal py-8">
            <SectionHeading
              eyebrow={c.description || undefined}
              title={c.name}
              action={
                <Link href={href(`/collections/${c.slug}`)} className="shrink-0 text-sm font-bold text-forest hover:underline">
                  {t("View all →")}
                </Link>
              }
            />
            <ProductGrid products={c.products.slice(0, 4)} priorityCount={i === 0 ? 2 : 0} ranked={c.slug === "bestsellers"} />
          </Container>
        ))}

      {dishes.length > 0 && (
        <Container className="reveal py-10">
          <SectionHeading eyebrow={t("Cooking something?")} title={t("Shop by dish")} />
          <ul className="flex flex-wrap gap-3">
            {dishes.map((d, i) => {
              const Art = [StarAnise, Chilli, Cardamom, Cinnamon, BayLeaf, Clove][i % 6];
              return (
                <li key={d.slug}>
                  <Link href={href(`/collections/${d.slug}`)} className="group flex items-center gap-2.5 rounded-full border border-line bg-paper py-2 pr-5 pl-2 font-semibold text-forest transition hover:-translate-y-0.5 hover:border-forest">
                    <span className="grid size-10 place-items-center rounded-full bg-sand transition group-hover:rotate-12">
                      <Art className="h-6 w-auto max-w-8" />
                    </span>
                    {d.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Container>
      )}

      <Container className="py-14">
        <div className="reveal">
          <SectionHeading eyebrow={t("How it works")} title={t("From our door to yours")} />
        </div>
        <div>
          {/* A van drives back and forth along the road above the steps (larger screens). */}
          <div className="relative mx-[12%] mb-6 hidden h-12 lg:block" aria-hidden="true">
            <svg viewBox="0 0 100 4" preserveAspectRatio="none" className="absolute inset-x-0 bottom-1 h-1 w-full">
              <path className="road" d="M0 2H100" stroke="#C9BBA6" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="travel absolute bottom-0 w-14">
              <Van className="drive w-14" />
            </div>
          </div>
          <ol className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
            {[
              { art: <SpiceMound className="w-12" />, title: t("You order"), text: t("Pick your spices. Pay online, or choose cash on delivery.") },
              { art: <Parcel className="w-12" />, title: t("We pack it"), text: t("Packed in {city}, with a GST invoice for every order.", { city }) },
              { art: <Van className="w-14" />, title: t("On its way"), text: t("Booked with a courier, with tracking updates by email.") },
              { art: <StarAnise className="w-11" />, title: t("At your door"), text: t("Something not right? Tell us within 48 hours with a photo.") },
            ].map((s, i) => (
              <li key={s.title} className="reveal card flex flex-col items-center p-4 text-center sm:p-6">
                <span className="relative grid size-[4.5rem] place-items-center rounded-full border border-line bg-ivory">
                  {s.art}
                  <span className="absolute -top-1 -right-1 grid size-6 place-items-center rounded-full bg-forest text-xs font-bold text-ivory">{i + 1}</span>
                </span>
                <h3 className="mt-4 text-lg sm:text-xl">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </Container>

      <section className="py-16">
        <Container className="reveal relative grid items-center gap-10 overflow-hidden rounded-[2rem] bg-forest px-6 py-12 text-ivory sm:px-12 lg:grid-cols-2">
          <StarAnise className="spin-slow pointer-events-none absolute -top-16 -right-16 w-64 opacity-10" />
          <div className="relative">
            <p className="mb-2 text-xs font-bold tracking-[.14em] text-saffron uppercase">{t("Our story")}</p>
            <h2 className="text-3xl text-ivory sm:text-4xl">{t("A small spice shop with a simple idea")}</h2>
          </div>
          <div className="relative space-y-4 text-ivory/80">
            <p>{t("The Farm Door is a new spice brand from {city}. We keep a focused range of the spices Indian kitchens use every day, and ship them with clear prices, honest delivery estimates and tracking you can follow.", { city })}</p>
            <Link href={href("/about")} className="inline-block font-bold text-saffron hover:underline">
              {t("Read more about us →")}
            </Link>
          </div>
        </Container>
      </section>

      {testimonials.length > 0 && (
        <Container className="py-8">
          <div className="reveal">
            <SectionHeading eyebrow={t("Reviews")} title={t("What our customers say")} />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {testimonials.slice(0, 3).map((review) => (
              <figure key={review.id} className="reveal card p-6">
                <Stars rating={review.rating} lang={lang} />
                {review.title && <p className="mt-3 font-semibold text-forest">{review.title}</p>}
                <blockquote className="mt-2 text-sm leading-relaxed text-ink/85">{review.body}</blockquote>
                <figcaption className="mt-4 text-xs text-muted">
                  {review.authorName} · {t("verified buyer of")}{" "}
                  <Link href={href(`/products/${review.productSlug}`)} className="underline">
                    {review.productName}
                  </Link>
                </figcaption>
              </figure>
            ))}
          </div>
        </Container>
      )}

      {/* A slow, endless band of spices. Decorative; stops with "Pause animations". */}
      <div className="ticker mt-6 overflow-hidden border-y border-line bg-paper py-5" aria-hidden="true">
        <div className="ticker-track flex w-max" style={{ "--ticker-duration": "50s" } as React.CSSProperties}>
          {stripRow(false)}
          {stripRow(true)}
          {stripRow(true)}
          {stripRow(true)}
        </div>
      </div>

      <Container className="py-12">
        <div className="reveal card flex flex-col items-start gap-6 p-8 sm:p-10 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl">{t("New spices, recipes and offers")}</h2>
            <p className="mt-2 text-muted">{t("Join our list. We email occasionally, never share your address, and you can leave any time.")}</p>
          </div>
          <NewsletterForm />
        </div>
      </Container>
    </>
  );
}
