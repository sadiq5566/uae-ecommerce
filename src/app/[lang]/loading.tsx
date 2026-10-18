export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6" aria-busy="true" role="status">
      <span className="sr-only">Loading… · جارٍ التحميل</span>
      <div className="skeleton h-9 w-1/3 rounded-xl" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="space-y-3"><div className="skeleton aspect-square rounded-2xl" /><div className="skeleton h-4 w-3/4 rounded" /><div className="skeleton h-4 w-1/3 rounded" /></div>)}
      </div>
    </div>
  );
}
