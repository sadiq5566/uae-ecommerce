import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "../globals.css";
import { AdminNav, type NavItem } from "@/components/admin/nav";
import { ToastProvider } from "@/components/toast";
import { getCurrentUser } from "@/lib/auth/session";
import { can, isStaff, type Permission } from "@/lib/auth/permissions";

const latin = Inter({ subsets: ["latin"], variable: "--font-latin", display: "swap" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display-latin", display: "swap" });

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false, follow: false } };

const themeScript = `try{var p=localStorage.getItem("theme")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}`;

const NAV: (NavItem & { perm: Permission })[] = [
  { href: "/admin", label: "Dashboard", icon: "📊", perm: "dashboard:read" },
  { href: "/admin/orders", label: "Orders", icon: "📦", perm: "orders:read" },
  { href: "/admin/returns", label: "Returns", icon: "↩️", perm: "orders:read" },
  { href: "/admin/products", label: "Products", icon: "🏷️", perm: "products:write" },
  { href: "/admin/categories", label: "Categories", icon: "🗂️", perm: "categories:write" },
  { href: "/admin/brands", label: "Brands", icon: "🔖", perm: "categories:write" },
  { href: "/admin/inventory", label: "Inventory", icon: "📉", perm: "inventory:write" },
  { href: "/admin/import", label: "CSV import/export", icon: "⇅", perm: "products:write" },
  { href: "/admin/reviews", label: "Reviews", icon: "⭐", perm: "reviews:moderate" },
  { href: "/admin/promotions", label: "Promotions", icon: "🎟️", perm: "promotions:write" },
  { href: "/admin/delivery", label: "Delivery", icon: "🚚", perm: "delivery:write" },
  { href: "/admin/articles", label: "Articles", icon: "📰", perm: "articles:write" },
  { href: "/admin/pages", label: "Pages", icon: "📄", perm: "articles:write" },
  { href: "/admin/homepage", label: "Homepage", icon: "🏠", perm: "homepage:write" },
  { href: "/admin/customers", label: "Customers", icon: "👥", perm: "customers:read" },
  { href: "/admin/marketing", label: "Marketing & leads", icon: "📣", perm: "customers:read" },
  { href: "/admin/users", label: "Staff & roles", icon: "🔑", perm: "users:manage" },
  { href: "/admin/settings", label: "Settings", icon: "⚙️", perm: "settings:write" },
  { href: "/admin/audit", label: "Audit log", icon: "🧾", perm: "audit:read" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // Defence in depth: every page and action still checks its own permission on the server.
  const items = user && isStaff(user.role) ? NAV.filter((n) => can(user.role, n.perm)) : [];
  return (
    <html lang="en" dir="ltr" data-scroll-behavior="smooth" suppressHydrationWarning className={`${latin.variable} ${display.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="min-h-dvh antialiased">
        <ToastProvider>
          {user && items.length ? (
            <div className="flex min-h-dvh flex-col lg:flex-row">
              <AdminNav items={items} user={{ name: user.name, role: user.role }} />
              <main id="main" className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
            </div>
          ) : <main id="main" className="p-4 sm:p-8">{children}</main>}
        </ToastProvider>
      </body>
    </html>
  );
}
