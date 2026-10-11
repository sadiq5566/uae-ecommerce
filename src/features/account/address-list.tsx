"use client";
import { useState } from "react";
import type { Dictionary } from "@/lib/dictionaries";
import { AddressForm } from "./address-form";
import { deleteAddressAction, setDefaultAddressAction } from "./actions";
import type { AddressView } from "./service";

export function AddressList({ t, addresses }: { t: Dictionary; addresses: AddressView[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const btn = "rounded-full border border-line px-3 py-1.5 text-xs font-medium transition hover:border-brand hover:text-brand";
  return (
    <div className="flex flex-col gap-5">
      {addresses.length === 0 && editing !== "new" && <p className="text-muted">{t.address.none}</p>}
      <ul className="grid gap-4 md:grid-cols-2">
        {addresses.map((a) => (
          <li key={a.id} className="rounded-2xl border border-line bg-surface p-5">
            {editing === a.id ? <AddressForm t={t} address={a} onDone={() => setEditing(null)} /> : (
              <>
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{a.label || a.recipientName}</p>
                  {a.isDefault && <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand">{t.address.default}</span>}
                </div>
                <address className="mt-2 text-sm not-italic leading-relaxed text-muted">
                  {a.recipientName} · <span dir="ltr">{a.phone}</span><br />
                  {[a.unit, a.building, a.street, a.area].filter(Boolean).join(", ")}<br />
                  {t.address.emirates[a.emirate as keyof typeof t.address.emirates]}
                  {a.landmark && <><br />{a.landmark}</>}
                </address>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className={btn} onClick={() => setEditing(a.id)}>{t.address.edit}</button>
                  {!a.isDefault && <form action={setDefaultAddressAction}><input type="hidden" name="id" value={a.id} /><button className={btn}>{t.address.setDefault}</button></form>}
                  <form action={deleteAddressAction} onSubmit={(e) => { if (!confirm(t.address.confirmDelete)) e.preventDefault(); }}><input type="hidden" name="id" value={a.id} /><button className={`${btn} hover:!border-danger hover:!text-danger`}>{t.address.delete}</button></form>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {editing === "new" ? (
        <div className="rounded-2xl border border-line bg-surface p-5"><AddressForm t={t} onDone={() => setEditing(null)} /></div>
      ) : (
        <button onClick={() => setEditing("new")} className="self-start rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-fg transition hover:brightness-110 active:scale-95">+ {t.address.add}</button>
      )}
    </div>
  );
}
