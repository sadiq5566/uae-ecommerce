"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshSession } from "@/components/session-store";
import type { Dictionary } from "@/lib/dictionaries";

const SIZE = 256;

/** Shrinks the picked photo to a 256 px square in the browser (so uploads stay tiny), then sends it. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  canvas.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.85));
}

export function AvatarUploader({ t, name, avatar }: { t: Dictionary; name: string; avatar?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function pick(file?: File) {
    if (!file) return;
    setBusy(true); setErr("");
    try {
      if (!file.type.startsWith("image/")) throw new Error("type");
      const fd = new FormData(); fd.set("file", await shrink(file), "avatar.jpg");
      const r = await fetch("/api/account/avatar", { method: "POST", body: fd });
      if (!r.ok) throw new Error("upload");
      router.refresh(); refreshSession(); // the header picture follows
    } catch { setErr(t.account.avatarError); }
    setBusy(false);
    if (input.current) input.current.value = "";
  }
  async function remove() {
    setBusy(true); setErr("");
    await fetch("/api/account/avatar", { method: "DELETE" });
    setBusy(false); router.refresh(); refreshSession();
  }

  return (
    <div className="flex items-center gap-4">
      <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-soft text-3xl font-bold text-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {avatar ? <img src={avatar} alt={name} width={80} height={80} className="size-full object-cover" /> : name.trim()[0]?.toUpperCase()}
      </span>
      <div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" id="avatar-file" onChange={(e) => pick(e.target.files?.[0])} />
        <div className="flex flex-wrap gap-2">
          <label htmlFor="avatar-file" className={`cursor-pointer rounded-full border border-line px-4 py-2 text-sm font-medium transition hover:border-brand hover:text-brand ${busy ? "pointer-events-none opacity-60" : ""}`}>{avatar ? t.account.avatarChange : t.account.avatarAdd}</label>
          {avatar && <button type="button" disabled={busy} onClick={remove} className="rounded-full px-3 py-2 text-sm text-muted hover:text-danger">{t.account.avatarRemove}</button>}
        </div>
        <p className="mt-1.5 text-xs text-muted">{t.account.avatarHint}</p>
        {err && <p role="alert" className="mt-1 text-sm text-danger">{err}</p>}
      </div>
    </div>
  );
}
