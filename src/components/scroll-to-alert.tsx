"use client";
import { useEffect } from "react";

/**
 * When a form comes back with an error (a new role="alert" element appears in the page flow) and it is off-screen,
 * scroll it into view. Fixed-position toasts are ignored.
 */
export function ScrollToAlert() {
  useEffect(() => {
    const reveal = (el: Element) => {
      if (getComputedStyle(el).position === "fixed") return;
      const r = el.getBoundingClientRect();
      if (r.top < 80 || r.bottom > window.innerHeight) el.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    const mo = new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (!(n instanceof Element)) continue;
        if (n.matches('[role="alert"]')) reveal(n);
        else n.querySelectorAll('[role="alert"]').forEach(reveal);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  return null;
}
