import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { IBM_Plex_Sans_Arabic, Inter, Fraunces } from "next/font/google";
import "../globals.css";
import { getDictionary } from "@/lib/dictionaries";
import { dirOf, isLocale, locales } from "@/lib/i18n";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { getNavCategories, getShowcase } from "@/features/catalog/service";
import { buildMenu } from "@/features/catalog/menu";
import { getStoreBrands } from "@/features/catalog/brands";
import { ToastProvider } from "@/components/toast";
import { SessionBootstrap } from "@/components/session-store";
import { ScrollToAlert } from "@/components/scroll-to-alert";
import { ScrollToTop } from "@/components/scroll-to-top";
import { getPublicOffers, offerLines } from "@/features/offers/service";
import { WelcomeModal } from "@/features/offers/welcome-modal";
import { alternatesFor, GEO_META, siteJsonLd } from "@/features/catalog/seo";
import { getBrand } from "@/lib/email";

const latin = Inter({ subsets: ["latin"], variable: "--font-latin", display: "swap" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display-latin", display: "swap" });
// Arabic font: two weights, not preloaded — English pages never download it (unicode-range), Arabic pages fetch it on first Arabic glyph.
const arabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "700"], variable: "--font-arabic", display: "swap", preload: false });

export const generateStaticParams = () => locales.map((lang) => ({ lang }));

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = await getDictionary(lang);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return {
    metadataBase: new URL(base),
    title: { default: t.brand, template: `%s · ${t.brand}` },
    description: t.hero.subtitle,
    alternates: alternatesFor(lang, ""),
    openGraph: { siteName: t.brand, title: t.brand, description: t.hero.subtitle, locale: lang === "ar" ? "ar_AE" : "en_AE", alternateLocale: lang === "ar" ? "en_AE" : "ar_AE", type: "website" },
    twitter: { card: "summary_large_image", title: t.brand, description: t.hero.subtitle },
    other: GEO_META,
  };
}

// Sets the theme before first paint to avoid a light/dark flash.
const themeScript = `try{var p=localStorage.getItem("theme")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}`;

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  // Locale chrome loads live MongoDB data, so defer it until a real request.
  await connection();
  const [t, categories, offers] = await Promise.all([getDictionary(lang), getNavCategories(), getPublicOffers()]);
  const menu = buildMenu(categories, await getShowcase().catch(() => ({})), await getStoreBrands().catch(() => []));
  const lines = offerLines(offers, t, lang);
  const brand = await getBrand(lang);
  const ld = siteJsonLd({ base: brand.url, name: brand.name, lang, logo: brand.logo, email: brand.supportEmail, whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER });
  return (
    <html lang={lang} dir={dirOf(lang)} data-scroll-behavior="smooth" suppressHydrationWarning className={`${latin.variable} ${display.variable} ${arabic.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="flex min-h-dvh flex-col antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
        <ToastProvider>
          <SessionBootstrap />
          <ScrollToAlert />
          <ScrollToTop />
          <Header locale={lang} t={t} menu={menu} offerLines={lines} />
          <main id="main" tabIndex={-1} className="flex-1 outline-none">{children}</main>
          <Footer locale={lang} t={t} menu={menu} />
          {offers.modal.enabled && lines.length > 0 && (
            <WelcomeModal
              locale={lang} version={offers.modal.version} delaySeconds={offers.modal.delaySeconds} collectLeads={offers.modal.collectLeads} lines={lines}
              title={offers.modal.title?.[lang]} body={offers.modal.body?.[lang]}
              labels={{ ...t.offers.modal, errors: t.errors }}
            />
          )}
        </ToastProvider>
      </body>
    </html>
  );
}
