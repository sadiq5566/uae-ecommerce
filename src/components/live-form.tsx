"use client";
import { useRef, useTransition, type FormHTMLAttributes } from "react";
import { useRouter } from "next/navigation";

/**
 * A GET filter form that applies itself: selects, checkboxes, radios and dates update the list at once, typed text and numbers after a short
 * pause (or Enter). The URL carries every filter, so links stay shareable. Empty fields are left out of the URL.
 */
export function LiveForm({ action, className = "", children, ...rest }: { action: string } & Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "method" | "onChange" | "onSubmit">) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [pending, start] = useTransition();

  const go = (form: HTMLFormElement) => {
    clearTimeout(timer.current);
    const p = new URLSearchParams();
    for (const [k, v] of new FormData(form)) if (typeof v === "string" && v !== "") p.append(k, v);
    const qs = p.toString();
    start(() => router.push(qs ? `${action}?${qs}` : action, { scroll: false }));
  };

  return (
    <form {...rest} action={action} method="get" aria-busy={pending} className={`${className} transition-opacity ${pending ? "opacity-70" : ""}`}
      onSubmit={(e) => { e.preventDefault(); go(e.currentTarget); }}
      onChange={(e) => {
        const form = e.currentTarget, el = e.target as unknown as HTMLInputElement;
        const typing = el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && ["text", "search", "number", "tel", "email"].includes(el.type));
        clearTimeout(timer.current);
        if (typing) timer.current = setTimeout(() => go(form), 600); else go(form);
      }}>
      {children}
    </form>
  );
}
