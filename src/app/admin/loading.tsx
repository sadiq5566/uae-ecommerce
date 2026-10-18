export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" role="status">
      <span className="sr-only">Loading…</span>
      <div className="skeleton h-9 w-1/4 rounded-xl" />
      <div className="skeleton h-12 rounded-2xl" />
      <div className="skeleton h-72 rounded-2xl" />
    </div>
  );
}
