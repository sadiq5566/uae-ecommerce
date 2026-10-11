export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-10 sm:px-6" aria-busy="true" role="status">
      <span className="sr-only">Loading… · جارٍ التحميل</span>
      <div className="skeleton h-9 w-1/3 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]"><div className="space-y-4"><div className="skeleton h-28 rounded-2xl" /><div className="skeleton h-28 rounded-2xl" /></div><div className="skeleton h-56 rounded-2xl" /></div>
    </div>
  );
}
