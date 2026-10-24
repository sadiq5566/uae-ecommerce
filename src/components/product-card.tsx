import Image from "@/components/img";
import Link from "next/link";
import type { ProductCardData } from "@/features/catalog/service";
import { formatAED, type Locale } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dictionaries";
import { AddToCart } from "./add-to-cart";
import { WishlistButton } from "./wishlist-button";

export function ProductCard({ p, locale, t }: { p: ProductCardData; locale: Locale; t: Dictionary }) {
  const off = p.finalPrice < p.price ? Math.round((1 - p.finalPrice / p.price) * 100) : 0;
  const href = `/${locale}/p/${p.slug}`;
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface transition duration-300 hover:-translate-y-1.5 hover:shadow-card">
      <div className="relative grid aspect-square place-items-center overflow-hidden" style={{ background: `linear-gradient(135deg, hsl(${p.hue} 70% 92%), hsl(${p.hue} 60% 82%))` }}>
        {p.image ? <>
          <Image src={p.image} alt="" fill sizes="(min-width:1024px) 25vw, 50vw" className={`object-cover transition duration-500 ${p.image2 ? "group-hover:opacity-0" : "group-hover:scale-105"}`} />
          {p.image2 && <Image src={p.image2} alt="" fill sizes="(min-width:1024px) 25vw, 50vw" className="object-cover opacity-0 transition duration-500 group-hover:opacity-100" />}
        </> : (
          <span aria-hidden className="text-7xl drop-shadow-lg transition-transform duration-500 group-hover:scale-125 group-hover:-rotate-6">{p.icon}</span>
        )}
        {off > 0 && <span className="absolute start-3 top-3 rounded-full bg-danger-solid px-2.5 py-1 text-xs font-bold text-white">-{off}%</span>}
        {p.stock === 0 && <span className="absolute inset-x-0 bottom-0 bg-fg/80 py-1 text-center text-xs font-semibold text-bg">{t.catalog.outOfStock}</span>}
        <div className="absolute end-3 top-3 z-20"><WishlistButton productId={p.id} locale={locale} label={t.product.save} savedLabel={t.product.saved} loginLabel={t.product.loginToSave} /></div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {p.brand && p.brand !== "Carts Heaven" && <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{p.brand}</p>}
        <h3 className="line-clamp-2 min-h-10 text-sm font-medium"><Link href={href} className="after:absolute after:inset-0 after:content-[''] hover:text-brand">{p.name[locale]}</Link></h3>
        {p.ratingCount > 0 && <p className="text-xs text-muted"><span className="text-gold">★</span> {p.ratingAvg.toFixed(1)} · {p.ratingCount} {t.product.reviews}</p>}
        <p className="mt-auto flex items-baseline gap-2">
          <span className="text-lg font-bold">{formatAED(p.finalPrice, locale)}</span>
          {off > 0 && <s className="text-xs text-muted">{formatAED(p.price, locale)}</s>}
        </p>
        <div className="relative z-10">
          {p.stock <= 0 ? <p className="rounded-xl bg-surface-2 py-2.5 text-center text-sm font-medium text-muted">{t.catalog.outOfStock}</p>
            : p.hasVariants ? <Link href={href} className="block w-full rounded-xl border border-brand px-4 py-2.5 text-center text-sm font-semibold text-brand transition hover:bg-brand-soft active:scale-95">{t.product.chooseOptions}</Link>
            : <AddToCart sku={p.sku} label={t.product.addToCart} doneLabel={t.product.added} errors={t.errors} />}
        </div>
      </div>
    </article>
  );
}
