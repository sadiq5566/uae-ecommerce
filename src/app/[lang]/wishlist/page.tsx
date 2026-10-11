import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale } from "@/lib/i18n";
import { requireUser } from "@/lib/auth/guard";
import { ProductCard } from "@/components/product-card";
import { getWishlistProducts } from "@/features/wishlist/service";
import { privatePage } from "@/lib/page-meta";


export const generateMetadata = privatePage((t) => t.wishlist.title);

export default async function WishlistPage({ params }: PageProps<"/[lang]/wishlist">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const user = await requireUser(lang, `/${lang}/wishlist`);
  const [t, items] = await Promise.all([getDictionary(lang), getWishlistProducts(user.id)]);
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-bold">{t.wishlist.title}</h1>
      {items.length === 0 ? (
        <div className="mt-8 grid place-items-center gap-3 rounded-2xl border border-dashed border-line py-20 text-center">
          <p className="text-5xl">♡</p><h2 className="font-display text-xl font-bold">{t.wishlist.empty}</h2>
          <p className="text-sm text-muted">{t.wishlist.emptyHint}</p>
          <Link href={`/${lang}`} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-fg">{t.account.startShopping}</Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"><h2 className="sr-only">{t.wishlist.title}</h2>{items.map((p) => <ProductCard key={p.id} p={p} locale={lang} t={t} />)}</div>
      )}
    </div>
  );
}
