"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

// One shared observer for every <Reveal> on the page (dozens of observers add up on listing pages).
let observer: IntersectionObserver | null = null;
const getObserver = () =>
  (observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("is-visible"); observer?.unobserve(e.target); }
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
  ));

/** Fades/slides children in when scrolled into view. Respects reduced motion via CSS. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = getObserver();
    io.observe(el);
    return () => io.unobserve(el);
  }, []);
  return (
    <div ref={ref} className={cn("reveal", className)} style={{ "--d": `${delay}ms` } as React.CSSProperties}>
      {children}
    </div>
  );
}
