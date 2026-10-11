import "server-only";
import { connectDb } from "@/lib/db";
import { Article } from "@/models/article";
import { ContentPage, PAGE_SLUGS, type PageSlug } from "@/models/content-page";
import { Homepage } from "@/models/homepage";

type L = { en: string; ar: string };
const l = (x?: { en?: string | null; ar?: string | null } | null): L => ({ en: x?.en ?? "", ar: x?.ar ?? "" });
const live = () => ({ status: "published" as const, publishAt: { $lte: new Date() } }); // scheduled articles appear automatically

export type ArticleView = { slug: string; title: L; excerpt: L; body: L; category?: string; cover?: string; coverAlt: L; icon: string; hue: number; author?: string; publishAt: string; seo: { title: L; description: L } };

const view = (a: Record<string, unknown>): ArticleView => {
  const x = a as { slug: string; title?: L; excerpt?: L; body?: L; category?: string; cover?: string; coverAlt?: L; icon: string; hue: number; author?: string; publishAt?: Date; seo?: { title?: L; description?: L } };
  return { slug: x.slug, title: l(x.title), excerpt: l(x.excerpt), body: l(x.body), category: x.category ?? undefined, cover: x.cover ?? undefined, coverAlt: l(x.coverAlt), icon: x.icon, hue: x.hue, author: x.author ?? undefined, publishAt: (x.publishAt ?? new Date()).toISOString(), seo: { title: l(x.seo?.title), description: l(x.seo?.description) } };
};

export async function listArticles(limit = 12, page = 1) {
  await connectDb();
  const [rows, total] = await Promise.all([Article.find(live()).sort({ publishAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Article.countDocuments(live())]);
  return { items: rows.map(view), total, pages: Math.max(1, Math.ceil(total / limit)) };
}

export async function getArticle(slug: string) {
  await connectDb();
  const a = await Article.findOne({ slug: slug.toLowerCase(), ...live() }).lean();
  return a ? view(a as unknown as Record<string, unknown>) : null;
}

export async function getPage(slug: string) {
  if (!(PAGE_SLUGS as readonly string[]).includes(slug)) return null;
  await connectDb();
  const p = await ContentPage.findOne({ slug: slug as PageSlug, published: true }).lean();
  return p ? { slug, title: l(p.title), body: l(p.body) } : null;
}

export async function publishedPageSlugs() {
  await connectDb();
  return (await ContentPage.find({ published: true }, { slug: 1 }).lean()).map((p) => p.slug as string);
}

export type Slide = { id: string; eyebrow: L; title: L; subtitle: L; ctaLabel: L; ctaHref?: string; image?: string; hue: number };
export type HomeConfig = { slides: Slide[]; sections: { deals: boolean; featured: boolean; newArrivals: boolean; popular: boolean; mostViewed: boolean; journal: boolean } };

/** Active banners (inside their campaign window, ordered) and section toggles. */
export async function getHomeConfig(now = new Date()): Promise<HomeConfig> {
  await connectDb();
  const h = await Homepage.findOne({ key: "home" }).lean();
  const slides = (h?.banners ?? [])
    .filter((b) => b.active && (!b.startsAt || b.startsAt <= now) && (!b.endsAt || b.endsAt >= now))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((b) => ({ id: b.id ?? "", eyebrow: l(b.eyebrow), title: l(b.title), subtitle: l(b.subtitle), ctaLabel: l(b.ctaLabel), ctaHref: b.ctaHref ?? undefined, image: b.image ?? undefined, hue: b.hue ?? 160 }));
  const s = (h?.sections ?? {}) as unknown as Record<string, boolean | undefined>;
  return { slides, sections: { deals: s.deals !== false, featured: s.featured !== false, newArrivals: s.newArrivals !== false, popular: s.popular !== false, mostViewed: s.mostViewed !== false, journal: s.journal !== false } };
}

export async function getSitemapContent() {
  await connectDb();
  const [articles, pages] = await Promise.all([Article.find(live(), { slug: 1, updatedAt: 1 }).lean(), publishedPageSlugs()]);
  return { articles: articles.map((a) => ({ slug: a.slug, updatedAt: (a as unknown as { updatedAt: Date }).updatedAt })), pages };
}
