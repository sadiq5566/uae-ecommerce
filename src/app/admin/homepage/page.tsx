import { guard } from "@/lib/admin/guard";
import { connectDb } from "@/lib/db";
import { PageHeader } from "@/components/admin/ui";
import { HomepageForm, type BannerData } from "@/features/admin/content/forms";
import { Homepage } from "@/models/homepage";
import { getBrand } from "@/lib/email";
import { getPublicOffers } from "@/features/offers/service";
import { storeFaqs } from "../../../../lib/faq";
import { getCategories } from "@/features/catalog/service";
import { sellsText } from "@/features/catalog/faq";

export const metadata = { title: "Homepage" };
const local = (d?: Date | null) => (d ? new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 16) : "");

export default async function HomepageAdmin() {
  await guard("homepage:write", "/admin/homepage");
  await connectDb();
  const h = await Homepage.findOne({ key: "home" }).lean();
  const l = (x?: { en?: string | null; ar?: string | null } | null) => ({ en: x?.en ?? "", ar: x?.ar ?? "" });
  const banners: BannerData[] = [...(h?.banners ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((b) => ({ id: b.id ?? "", active: b.active, order: b.order ?? 0, eyebrow: l(b.eyebrow), title: l(b.title), subtitle: l(b.subtitle), ctaLabel: l(b.ctaLabel), ctaHref: b.ctaHref ?? "", image: b.image ?? undefined, hue: b.hue ?? 160, startsAt: local(b.startsAt), endsAt: local(b.endsAt) }));
  const [bEn, bAr, offers] = await Promise.all([getBrand("en"), getBrand("ar"), getPublicOffers()]);
  const cats = (await getCategories()).filter((c) => !c.parent);
  const sf = storeFaqs({ store: bEn.name, storeAr: bAr.name, cod: offers.cod, returnDays: offers.returnDays, ...sellsText({ en: cats.map((c) => c.name.en), ar: cats.map((c) => c.name.ar) }) });
  const suggestedFaqs = sf.en.map((f, i) => ({ q: f.q, a: f.a, qAr: sf.ar[i]?.q ?? "", aAr: sf.ar[i]?.a ?? "" }));
  const faqs = ((h as unknown as { faqs?: { q?: string; a?: string; qAr?: string; aAr?: string }[] } | null)?.faqs ?? []).map((f) => ({ q: f.q ?? "", a: f.a ?? "", qAr: f.qAr ?? "", aAr: f.aAr ?? "" }));
  const sections = (h?.sections ?? {}) as unknown as Record<string, boolean>;
  return (<><PageHeader title="Homepage" sub="Hero banners / campaigns and which sections appear." /><HomepageForm seo={{ title: l(h?.seo?.title), description: l(h?.seo?.description), keywords: l(h?.seo?.keywords) }} faqs={faqs} suggestedFaqs={suggestedFaqs} banners={banners} sections={{ deals: sections.deals !== false, featured: sections.featured !== false, newArrivals: sections.newArrivals !== false, popular: sections.popular !== false, mostViewed: sections.mostViewed !== false, journal: sections.journal !== false }} /></>);
}
