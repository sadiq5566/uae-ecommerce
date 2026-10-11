"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";

export type NavItem = { href: string; label: string; icon: string };

function NavList({ items, path, onNavigate }: { items: NavItem[]; path: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Admin" className="flex flex-col gap-0.5">
      {items.map((i) => {
        const active = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
        return <Link key={i.href} href={i.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${active ? "bg-brand text-brand-fg" : "hover:bg-surface-2"}`}><span aria-hidden className="w-5 text-center">{i.icon}</span>{i.label}</Link>;
      })}
    </nav>
  );
}

export function AdminNav({ items, user }: { items: NavItem[]; user: { name: string; role: string } }) {
  const path = usePathname();
  const dlg = useRef<HTMLDialogElement>(null);
  const closeDrawer = () => dlg.current?.close();
  const foot = <div className="border-t border-line pt-4 text-xs text-muted"><p className="font-semibold text-fg">{user.name}</p><p>{user.role.replace(/_/g, " ")}</p><Link href="/en" className="mt-2 inline-block text-brand hover:underline">← View store</Link></div>;
  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
        <button onClick={() => dlg.current?.showModal()} aria-label="Open menu" className="grid size-10 place-items-center rounded-full hover:bg-surface-2">☰</button>
        <span className="font-display font-bold">Admin</span><span className="size-10" />
      </header>
      <dialog ref={dlg} onClick={(e) => e.target === dlg.current && dlg.current?.close()} className="m-0 h-full max-h-none w-72 max-w-[85vw] bg-surface p-0 text-fg backdrop:bg-black/50 lg:hidden">
        <div className="flex h-full flex-col gap-4 overflow-y-auto p-4"><div className="flex items-center justify-between"><span className="font-display text-lg font-bold">Admin</span><button onClick={closeDrawer} aria-label="Close menu" className="grid size-9 place-items-center rounded-full hover:bg-surface-2">✕</button></div><NavList items={items} path={path} onNavigate={closeDrawer} /><div className="mt-auto">{foot}</div></div>
      </dialog>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-4 overflow-y-auto border-e border-line bg-surface p-4 lg:flex">
        <Link href="/admin" className="px-3 py-2 font-display text-xl font-bold">Admin</Link><NavList items={items} path={path} /><div className="mt-auto">{foot}</div>
      </aside>
    </>
  );
}
