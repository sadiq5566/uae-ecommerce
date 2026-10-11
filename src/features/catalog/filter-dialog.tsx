"use client";
import { useRef, type ReactNode } from "react";

export function FilterDialog({ label, close, children }: { label: string; close: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button onClick={() => ref.current?.showModal()} className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium lg:hidden">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>{label}
      </button>
      <dialog ref={ref} aria-label={label} onClick={(e) => e.target === ref.current && ref.current?.close()} className="m-0 h-full max-h-none w-[min(90vw,24rem)] max-w-none bg-surface p-0 text-fg backdrop:bg-black/50 backdrop:backdrop-blur-sm ltr:me-auto rtl:ms-auto">
        <div className="flex h-full flex-col overflow-y-auto p-5">
          <div className="mb-5 flex items-center justify-between"><h2 className="font-display text-lg font-bold">{label}</h2><button onClick={() => ref.current?.close()} aria-label={close} className="grid size-9 place-items-center rounded-full hover:bg-surface-2">✕</button></div>
          {children}
        </div>
      </dialog>
    </>
  );
}
