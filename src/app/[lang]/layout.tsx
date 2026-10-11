import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IBM_Plex_Sans_Arabic, Inter, Fraunces } from "next/font/google";
import "../globals.css";
import { getDictionary } from "@/lib/dictionaries";
import { dirOf, isLocale, locales } from "@/lib/i18n";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { getNavCategories } from "@/features/catalog/service";
import { ToastProvider } from "@/components/toast";
import { SessionBootstrap } from "@/components/session-store";

const latin = Inter({ subsets: ["latin"], variable: "--font-latin", display: "swap" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display-latin", display: "swap" });
const arabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600", "700"], variable: "--font-arabic", display: "swap" });

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
    alternates: { canonical: `/${lang}`, languages: { en: "/en", ar: "/ar" } },
    openGraph: { title: t.brand, description: t.hero.subtitle, locale: lang === "ar" ? "ar_AE" : "en_AE", type: "website" },
  };
}

// Sets the theme before first paint to avoid a light/dark flash.
const themeScript = `try{var p=localStorage.getItem("theme")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}`;

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const [t, categories] = await Promise.all([getDictionary(lang), getNavCategories()]);
  return (
    <html lang={lang} dir={dirOf(lang)} suppressHydrationWarning className={`${latin.variable} ${display.variable} ${arabic.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="flex min-h-dvh flex-col antialiased">
        <ToastProvider>
          <SessionBootstrap />
          <Header locale={lang} t={t} categories={categories} />
          <main id="main" className="flex-1">{children}</main>
          <Footer locale={lang} t={t} categories={categories} />
        </ToastProvider>
      </body>
    </html>
  );
}
