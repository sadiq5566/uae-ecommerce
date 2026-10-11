export default function AdminLoading() {
  return <div aria-busy="true" role="status" className="space-y-4"><span className="sr-only">Loading… · جارٍ التحميل</span><div className="skeleton h-9 w-1/4 rounded-xl" /><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}</div><div className="skeleton h-64 rounded-2xl" /></div>;
}
