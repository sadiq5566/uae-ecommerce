import { guard } from "@/lib/admin/guard";
import { connectDb } from "@/lib/db";
import { PageHeader } from "@/components/admin/ui";
import { HomepageForm, type BannerData } from "@/features/admin/content/forms";
import { Homepage } from "@/models/homepage";

export const metadata = { title: "Homepage" };
const local = (d?: Date | null) => (d ? new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 16) : "");

export default async function HomepageAdmin() {
  await guard("homepage:write", "/admin/homepage");
  await connectDb();
  const h = await Homepage.findOne({ key: "home" }).lean();
  const l = (x?: { en?: string | null; ar?: string | null } | null) => ({ en: x?.en ?? "", ar: x?.ar ?? "" });
  const banners: BannerData[] = [...(h?.banners ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((b) => ({ id: b.id ?? "", active: b.active, order: b.order ?? 0, eyebrow: l(b.eyebrow), title: l(b.title), subtitle: l(b.subtitle), ctaLabel: l(b.ctaLabel), ctaHref: b.ctaHref ?? "", image: b.image ?? undefined, hue: b.hue ?? 160, startsAt: local(b.startsAt), endsAt: local(b.endsAt) }));
  const sections = (h?.sections ?? {}) as unknown as Record<string, boolean>;
  return (<><PageHeader title="Homepage" sub="Hero banners / campaigns and which sections appear." /><HomepageForm banners={banners} sections={{ deals: sections.deals !== false, featured: sections.featured !== false, newArrivals: sections.newArrivals !== false, popular: sections.popular !== false, mostViewed: sections.mostViewed !== false, journal: sections.journal !== false }} /></>);
}
