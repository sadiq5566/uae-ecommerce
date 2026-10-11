"use client";
import type { ButtonHTMLAttributes } from "react";

/** Submit button that asks for confirmation first (destructive actions). */
export function ConfirmButton({ message, children, ...rest }: { message: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...rest} onClick={(e) => { if (!confirm(message)) e.preventDefault(); rest.onClick?.(e); }}>{children}</button>;
}
