"use client";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Card, Pill, btnDanger } from "@/components/admin/ui";
import { deleteZoneAction } from "./actions";
import { ZoneForm, type ZoneData } from "./forms";

export function ZonesManager({ zones, emirates }: { zones: ZoneData[]; emirates: { value: string; label: string }[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const label = (v: string) => emirates.find((e) => e.value === v)?.label ?? v;
  return (
    <div className="flex flex-col gap-4">
      {zones.map((z) => (
        <Card key={z.id} title={z.name.en} actions={<div className="flex items-center gap-2"><Pill tone={z.active ? "green" : "grey"}>{z.active ? "active" : "off"}</Pill><button onClick={() => setEditing(editing === z.id ? null : z.id!)} className="text-sm font-semibold text-brand hover:underline">{editing === z.id ? "Close" : "Edit"}</button></div>}>
          {editing === z.id ? (
            <div className="flex flex-col gap-4"><ZoneForm zone={z} emirates={emirates} onDone={() => setEditing(null)} />
              <form action={deleteZoneAction}><input type="hidden" name="id" value={z.id} /><ConfirmButton message="Delete this delivery zone? Customers in these emirates won't be able to check out until another zone covers them." className={btnDanger}>Delete zone</ConfirmButton></form></div>
          ) : <p className="text-sm text-muted">AED {z.fee} · {z.freeThreshold != null ? `free over AED ${z.freeThreshold}` : "store-wide free threshold"} · {z.estimate.en} · {z.emirates.map(label).join(", ")}</p>}
        </Card>
      ))}
      {editing === "new" ? <Card title="New zone"><ZoneForm emirates={emirates} onDone={() => setEditing(null)} /></Card> : <button onClick={() => setEditing("new")} className="self-start rounded-xl border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface-2">+ Add delivery zone</button>}
    </div>
  );
}
