import Link from "next/link";
import { DoorIllustration } from "@/components/shop/door-illustration";
import { NewsletterForm } from "@/components/shop/newsletter-form";
import { ProductGrid } from "@/components/shop/product-card";
import { Container, LinkButton, SectionHeading, Stars } from "@/components/ui";
import { getCategories, getHomeCollections, getPublicSettings, getTestimonials } from "@/data/catalog";

const CATEGORY_STYLES = ["bg-[#F3E3BC]", "bg-[#F2D6C8]", "bg-[#E5ECDC]", "bg-[#EBDCCB]"];

export default async function HomePage() {
  const [categories, collections, testimonials, { cod, store }] = await Promise.all([getCategories(), getHomeCollections(), getTestimonials(), getPublicSettings()]);

  const promises = [
    { title: "Delivery across India", text: "Live courier rates and delivery dates for your pincode, shown before you pay." },
    { title: "Secure payments", text: "UPI, cards and net banking through Razorpay. We never see your card details." },
    cod.enabled ? { title: "Cash on delivery", text: "Prefer to pay at the door? Choose cash on delivery at checkout." } : null,
    { title: "Track every order", text: "Follow your parcel from our door to yours, with email updates." },
  ].filter(Boolean) as { title: string; text: string }[];

  return (
    <>
      <section className="overflow-hidden">
        <Container className="grid items-center gap-8 py-12 sm:py-16 lg:grid-cols-[1.1fr_.9fr] lg:py-20">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-line bg-paper/70 px-3 py-1.5 text-xs font-bold tracking-[.14em] text-forest uppercase">Indian spices &amp; pantry essentials</p>
            <h1 className="text-5xl leading-[1.04] font-medium sm:text-6xl">
              Everyday spices, delivered to <em className="font-normal text-saffron-deep">your door.</em>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Whole spices, ground spices and masala blends, shipped from {store.city || "India"} to every corner of India.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/shop" size="lg">
                Shop all spices
              </LinkButton>
              <LinkButton href="/collections/bestsellers" size="lg" variant="secondary">
                See bestsellers
              </LinkButton>
            </div>
          </div>
          <DoorIllustration className="px-10 sm:px-16 lg:px-6" />
        </Container>
      </section>

      <section className="border-y border-line bg-paper">
        <Container className={`grid gap-6 py-8 sm:grid-cols-2 ${promises.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          {promises.map((p) => (
            <div key={p.title}>
              <p className="font-display text-lg font-semibold text-forest">{p.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{p.text}</p>
            </div>
          ))}
        </Container>
      </section>

      {categories.length > 0 && (
        <Container className="py-14">
          <SectionHeading eyebrow="Browse" title="Shop by category" />
          <div className="grid gap-4 sm:grid-cols-3">
            {categories.map((c, i) => (
              <Link key={c.id} href={`/category/${c.slug}`} className={`group rounded-[var(--radius-card)] border border-line p-6 transition hover:-translate-y-0.5 ${CATEGORY_STYLES[i % CATEGORY_STYLES.length]}`}>
                <p className="font-display text-2xl font-semibold text-forest">{c.name}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink/75">{c.description}</p>
                <p className="mt-6 text-sm font-bold text-forest group-hover:underline">Shop {c.name.toLowerCase()} →</p>
              </Link>
            ))}
          </div>
        </Container>
      )}

      {collections
        .filter((c) => c.products.length > 0)
        .map((c, i) => (
          <Container key={c.id} className="py-8">
            <SectionHeading
              eyebrow={c.description || undefined}
              title={c.name}
              action={
                <Link href={`/collections/${c.slug}`} className="shrink-0 text-sm font-bold text-forest hover:underline">
                  View all →
                </Link>
              }
            />
            <ProductGrid products={c.products.slice(0, 4)} priorityCount={i === 0 ? 2 : 0} />
          </Container>
        ))}

      <section className="py-16">
        <Container className="grid items-center gap-10 rounded-[2rem] bg-forest px-6 py-12 text-ivory sm:px-12 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-bold tracking-[.14em] text-saffron uppercase">Our story</p>
            <h2 className="text-3xl text-ivory sm:text-4xl">A small spice shop with a simple idea</h2>
          </div>
          <div className="space-y-4 text-ivory/80">
            <p>The Farm Door is a new spice brand from {store.city || "India"}. We keep a focused range of the spices Indian kitchens use every day, and ship them with clear prices, honest delivery estimates and tracking you can follow.</p>
            <Link href="/about" className="inline-block font-bold text-saffron hover:underline">
              Read more about us →
            </Link>
          </div>
        </Container>
      </section>

      {testimonials.length > 0 && (
        <Container className="py-8">
          <SectionHeading eyebrow="Reviews" title="What our customers say" />
          <div className="grid gap-4 md:grid-cols-3">
            {testimonials.slice(0, 3).map((t) => (
              <figure key={t.id} className="card p-6">
                <Stars rating={t.rating} />
                {t.title && <p className="mt-3 font-semibold text-forest">{t.title}</p>}
                <blockquote className="mt-2 text-sm leading-relaxed text-ink/85">{t.body}</blockquote>
                <figcaption className="mt-4 text-xs text-muted">
                  {t.authorName} · verified buyer of{" "}
                  <Link href={`/products/${t.productSlug}`} className="underline">
                    {t.productName}
                  </Link>
                </figcaption>
              </figure>
            ))}
          </div>
        </Container>
      )}

      <Container className="py-12">
        <div className="card flex flex-col items-start gap-6 p-8 sm:p-10 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl">New spices, recipes and offers</h2>
            <p className="mt-2 text-muted">Join our list. We email occasionally, never share your address, and you can leave any time.</p>
          </div>
          <NewsletterForm />
        </div>
      </Container>
    </>
  );
}
