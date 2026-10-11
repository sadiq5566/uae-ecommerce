"use client";
import { useEffect } from "react";

export function ViewTracker({ id }: { id: string }) {
  useEffect(() => { fetch(`/api/views?id=${id}`, { method: "POST", keepalive: true }).catch(() => {}); }, [id]);
  return null;
}
