import Link from "next/link";
export const metadata = { title: "Not found" };
export default function AdminNotFound() {
  return <div className="mx-auto grid max-w-md place-items-center gap-3 py-24 text-center"><p className="text-6xl" aria-hidden>🧭</p><h1 className="font-display text-2xl font-bold">Not found</h1><p className="text-sm text-muted">That record doesn&apos;t exist (it may have been deleted).</p><Link href="/admin" className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-fg">Dashboard</Link></div>;
}
