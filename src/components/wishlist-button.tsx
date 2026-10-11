"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toggleWishlistAction } from "@/features/wishlist/actions";
import type { Locale } from "@/lib/i18n";
import { setWishlist, useSession } from "./session-store";
import { useToast } from "./toast";

export function WishlistButton({ productId, locale, label, savedLabel, loginLabel, className = "" }: {
  productId: string; locale: Locale; label: string; savedLabel: string; loginLabel: string; className?: string;
}) {
  const { wishlist } = useSession();
  const saved = wishlist.includes(productId);
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <button
      type="button" aria-pressed={saved} aria-label={saved ? savedLabel : label} title={saved ? savedLabel : label} disabled={pending}
      onClick={() => start(async () => {
        const r = await toggleWishlistAction(productId);
        if (r.error === "auth") { toast(loginLabel, "error"); router.push(`/${locale}/login?next=${encodeURIComponent(location.pathname)}`); return; }
        if (r.ok && r.ids) setWishlist(r.ids);
      })}
      className={`grid size-9 place-items-center rounded-full bg-surface/90 text-lg shadow-card backdrop-blur transition hover:scale-110 active:scale-90 ${saved ? "text-danger" : "text-muted"} ${className}`}
    >
      <span key={String(saved)} className={saved ? "animate-pop" : ""}>{saved ? "♥" : "♡"}</span>
    </button>
  );
}
