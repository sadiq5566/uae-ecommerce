"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto grid max-w-xl place-items-center gap-4 px-6 py-32 text-center">
      <p className="text-6xl">⚠️</p>
      <h1 className="font-display text-2xl font-bold">Something went wrong · حدث خطأ ما</h1>
      <button onClick={reset} className="rounded-full bg-brand px-6 py-3 font-semibold text-brand-fg">Try again · حاول مجدداً</button>
    </div>
  );
}
