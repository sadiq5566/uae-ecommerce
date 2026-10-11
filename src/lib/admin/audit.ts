import "server-only";
import { connectDb } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { AuditLog } from "@/models/audit-log";

/** Record a sensitive admin action. Keep `meta` small and free of secrets/personal data. */
export async function audit(user: Pick<SessionUser, "id" | "email">, action: string, entity: string, entityId: string | undefined, summary: string, meta?: Record<string, unknown>) {
  try {
    await connectDb();
    await AuditLog.create({ actor: user.id, actorEmail: user.email, action, entity, entityId, summary: summary.slice(0, 300), meta });
  } catch (e) {
    console.error("[audit] failed to write audit log:", (e as Error).message);
  }
}
