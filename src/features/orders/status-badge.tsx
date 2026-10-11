const tone: Record<string, string> = {
  pending_payment: "bg-gold-soft text-gold-ink", confirmed: "bg-brand-soft text-brand", processing: "bg-brand-soft text-brand", packed: "bg-brand-soft text-brand",
  out_for_delivery: "bg-brand-soft text-brand", delivered: "bg-brand text-brand-fg", cancelled: "bg-danger/15 text-danger", refund_pending: "bg-gold-soft text-gold-ink", refunded: "bg-surface-2 text-muted",
};
export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${tone[status] ?? "bg-surface-2"}`}>{label}</span>;
}
