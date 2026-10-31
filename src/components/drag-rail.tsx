"use client";
import { useRef, useState } from "react";

/** Horizontal product rail with no visible scrollbar: drag with the mouse, swipe on touch, or use the arrows. The next card always peeks in. */
export function DragRail({ children, className = "", prev, next }: { children: React.ReactNode; className?: string; prev: string; next: string }) {
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef({ on: false, x: 0, left: 0, moved: false });
  const [grabbing, setGrabbing] = useState(false);

  const by = (dir: 1 | -1) => {
    const r = el.current;
    if (r) r.scrollBy({ left: dir * r.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={el}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || !el.current) return;
          drag.current = { on: true, x: e.clientX, left: el.current.scrollLeft, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d.on || !el.current) return;
          const dx = e.clientX - d.x;
          if (!d.moved && Math.abs(dx) > 5) { d.moved = true; setGrabbing(true); }
          if (d.moved) el.current.scrollLeft = d.left - dx;
        }}
        onPointerUp={() => { drag.current.on = false; setGrabbing(false); }}
        onPointerLeave={() => { drag.current.on = false; setGrabbing(false); }}
        onClickCapture={(e) => { if (drag.current.moved) { e.preventDefault(); e.stopPropagation(); drag.current.moved = false; } }}
        className={`flex gap-4 overflow-x-auto overflow-y-hidden pb-2 no-scrollbar${grabbing ? "cursor-grabbing select-none" : "cursor-grab snap-x snap-mandatory"} ${className}`}
      >
        {children}
      </div>
      <button type="button" aria-label={prev} onClick={() => by(-1)} className="absolute start-1 top-1/3 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white text-[#0c2231] shadow-lg transition hover:scale-105 sm:grid"><span className="flip-rtl">←</span></button>
      <button type="button" aria-label={next} onClick={() => by(1)} className="absolute end-1 top-1/3 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white text-[#0c2231] shadow-lg transition hover:scale-105 sm:grid"><span className="flip-rtl">→</span></button>
    </div>
  );
}
