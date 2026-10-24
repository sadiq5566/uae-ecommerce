import Image from "@/components/img";

/** Small product picture with the emoji placeholder as fallback. Decorative: the product name is always next to it. */
export function Thumb({ src, icon = "📦", size = 48, className = "" }: { src?: string | null; icon?: string; size?: number; className?: string }) {
  return (
    <span aria-hidden className={`relative grid shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-surface-2 ${className}`} style={{ width: size, height: size, fontSize: size * 0.5 }}>
      {src ? <Image src={src} alt="" fill sizes={`${size}px`} className="object-cover" /> : icon}
    </span>
  );
}
