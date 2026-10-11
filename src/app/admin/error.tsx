"use client";
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div role="alert" className="mx-auto grid max-w-md place-items-center gap-3 py-24 text-center"><p className="text-6xl" aria-hidden>⚠️</p><h1 className="font-display text-2xl font-bold">Something went wrong</h1><p className="text-sm text-muted">The action didn&apos;t complete. Try again; if it persists, check the server log{error.digest ? ` (ref ${error.digest})` : ""}.</p><button onClick={reset} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-fg">Try again</button></div>;
}
