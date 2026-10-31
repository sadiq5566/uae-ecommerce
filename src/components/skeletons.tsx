/** Placeholders that mirror the real layout, so the page doesn't jump when content arrives. Server-safe (no hooks). */
export function CardSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-0 pb-4" aria-hidden>
      <div className="skeleton aspect-square rounded-t-2xl" />
      <div className="space-y-2 px-3 sm:px-4"><div className="skeleton h-4 w-3/4 rounded" /><div className="skeleton h-4 w-1/3 rounded" /><div className="skeleton h-10 w-full rounded-xl" /></div>
    </div>
  );
}

export function GridSkeleton({ n = 8 }: { n?: number }) {
  return <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">{Array.from({ length: n }, (_, i) => <CardSkeleton key={i} />)}</div>;
}

export function Busy({ children }: { children: React.ReactNode }) {
  return <div role="status" aria-busy="true" className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><span className="sr-only">Loading… · جارٍ التحميل</span>{children}</div>;
}

export function ListingSkeleton() {
  return (
    <Busy>
      <div className="skeleton h-4 w-48 rounded" />
      <div className="skeleton mt-4 h-9 w-1/2 rounded-xl sm:w-1/3" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[16rem_1fr]">
        <div className="hidden space-y-4 lg:block">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}</div>
        <div><div className="skeleton mb-5 h-10 w-full rounded-full" /><GridSkeleton n={8} /></div>
      </div>
    </Busy>
  );
}

export function ProductSkeleton() {
  return (
    <Busy>
      <div className="skeleton h-4 w-56 rounded" />
      <div className="mt-6 grid grid-cols-1 gap-6 sm:gap-10 lg:grid-cols-2">
        <div className="skeleton aspect-square rounded-3xl" />
        <div className="space-y-4"><div className="skeleton h-8 w-3/4 rounded-xl" /><div className="skeleton h-5 w-1/3 rounded" /><div className="skeleton h-10 w-1/2 rounded-xl" /><div className="skeleton h-24 rounded-2xl" /><div className="skeleton h-12 rounded-xl" /><div className="skeleton h-12 rounded-xl" /></div>
      </div>
    </Busy>
  );
}
