import Link from "next/link";
export const metadata = { title: "Not allowed" };
export default function Forbidden() {
  return (
    <div className="mx-auto grid max-w-md place-items-center gap-3 py-24 text-center">
      <p className="text-6xl">🔒</p><h1 className="font-display text-2xl font-bold">You don&apos;t have access to this area</h1>
      <p className="text-sm text-muted">Ask an owner to change your role if you need it.</p>
      <Link href="/en" className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-fg">Back to store</Link>
    </div>
  );
}
