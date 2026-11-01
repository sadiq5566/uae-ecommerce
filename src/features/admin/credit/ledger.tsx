import Link from "next/link";
import { Pill, Table, aed, dubaiDate } from "@/components/admin/ui";
import { maskEmail } from "@/features/admin/people/mask";
import type { AdjustmentRow } from "./queries";

/** The credit ledger table. Customer emails are partly hidden unless the viewer is an owner. */
export function Ledger({ rows, showCustomer = true, owner, empty = "No adjustments yet." }: { rows: AdjustmentRow[]; showCustomer?: boolean; owner: boolean; empty?: string }) {
  return (
    <Table label="Web credit adjustments" empty={rows.length ? undefined : empty} head={["When (UAE time)", ...(showCustomer ? ["Customer"] : []), "Change", "Reason", "Balance", "Done by"]}>
      {rows.map((r) => (
        <tr key={r.id}>
          <td className="whitespace-nowrap text-xs text-muted">{dubaiDate(r.at, true)}</td>
          {showCustomer && <td><Link href={`/admin/customers/${r.customer.id}`} className="font-medium hover:text-brand">{r.customer.name || "—"}</Link><span className="block text-xs text-muted">{owner ? r.customer.email : maskEmail(r.customer.email)}</span></td>}
          <td className="whitespace-nowrap"><Pill tone={r.kind === "add" ? "green" : "red"}>{r.kind === "add" ? "Added" : "Removed"}</Pill> <b className={r.kind === "add" ? "text-brand" : "text-danger"}>{r.kind === "add" ? "+" : "−"}{aed(r.amount)}</b></td>
          <td className="max-w-64 text-sm">{r.reason}{r.notified && <span className="ms-2 text-xs text-muted" title="The customer was emailed">✉</span>}</td>
          <td className="whitespace-nowrap text-xs text-muted">{aed(r.balanceBefore)} → <b className="text-fg">{aed(r.balanceAfter)}</b></td>
          <td className="text-xs">{r.admin.name || r.admin.email}<span className="block text-muted">{r.admin.name ? r.admin.email : ""}</span></td>
        </tr>
      ))}
    </Table>
  );
}
