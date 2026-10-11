export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6" aria-busy>
      <div className="skeleton h-64 rounded-3xl" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton aspect-[3/4] rounded-2xl" />)}</div>
    </div>
  );
}
