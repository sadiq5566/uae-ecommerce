import Link from "next/link";
export default function NotFound() {
  return (
    <div className="mx-auto grid max-w-xl place-items-center gap-4 px-6 py-32 text-center">
      <p className="animate-float text-7xl">🧭</p>
      <h1 className="font-display text-3xl font-bold">404</h1>
      <p className="text-muted">Page not found · الصفحة غير موجودة</p>
      <Link href="/" className="rounded-full bg-brand px-6 py-3 font-semibold text-brand-fg">Home · الرئيسية</Link>
    </div>
  );
}
