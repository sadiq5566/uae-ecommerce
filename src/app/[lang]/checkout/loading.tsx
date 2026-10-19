export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-busy="true" role="status">
      <span className="sr-only">Loading… · جارٍ التحميل</span>
      <div className="skeleton mb-6 h-9 w-48 rounded-xl" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="space-y-4"><div className="skeleton h-64 rounded-2xl" /><div className="skeleton h-40 rounded-2xl" /></div>
        <div className="skeleton h-96 rounded-2xl" />
      </div>
    </div>
  );
}
