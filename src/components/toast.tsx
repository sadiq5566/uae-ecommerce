"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Toast = { id: number; text: string; kind: "ok" | "error" };
type Push = (text: string, kind?: Toast["kind"]) => void;
const Ctx = createContext<Push>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback<Push>((text, kind = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} className={`animate-slide-in pointer-events-auto rounded-full px-5 py-3 text-sm font-medium shadow-card ${t.kind === "error" ? "bg-danger-solid text-white" : "bg-fg text-bg"}`}>
            {t.kind === "error" ? "!" : "✓"} {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
