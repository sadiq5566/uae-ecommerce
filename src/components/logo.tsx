export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={className}>
      <rect width="64" height="64" rx="16" fill="var(--brand)" />
      <path d="M21 48V16h13.500c6.400 0 10.500 3.400 10.500 9s-4.100 9-10.500 9H21m12 0 11 14" fill="none" stroke="var(--brand-fg)" strokeWidth="5.500" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M49 8l1.800 4.200L55 14l-4.200 1.800L49 20l-1.800-4.200L43 14l4.200-1.800z" fill="#e0b25c" />
    </svg>
  );
}

export function Logo({ name, showName = true, className = "" }: { name: string; showName?: boolean; className?: string }) {
  return (
    <span className={`group inline-flex items-center gap-2 font-display text-xl font-bold ${className}`}>
      <LogoMark className="transition-transform group-hover:rotate-6" />
      {showName && <span className="hidden whitespace-nowrap sm:inline">{name}</span>}
    </span>
  );
}
