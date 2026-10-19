"use client";
import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

/** Every page change (link, redirect after a form submit) starts at the top, instantly — never at the previous scroll position. */
export function ScrollToTop() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    try { history.scrollRestoration = "manual"; } catch {}
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}
