import type { Role } from "@/models/user";

export type Permission =
  | "products:write" | "categories:write" | "inventory:write" | "orders:read" | "orders:write"
  | "customers:read" | "reviews:moderate" | "promotions:write" | "delivery:write"
  | "articles:write" | "homepage:write" | "settings:write" | "users:manage" | "audit:read" | "dashboard:read";

const ALL: Permission[] = [
  "products:write", "categories:write", "inventory:write", "orders:read", "orders:write", "customers:read", "reviews:moderate",
  "promotions:write", "delivery:write", "articles:write", "homepage:write", "settings:write", "users:manage", "audit:read", "dashboard:read",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  customer: [],
  owner: ALL,
  catalog_manager: ["dashboard:read", "products:write", "categories:write", "inventory:write", "promotions:write"],
  operations_manager: ["dashboard:read", "orders:read", "orders:write", "customers:read", "inventory:write", "reviews:moderate", "delivery:write"],
  content_editor: ["dashboard:read", "articles:write", "homepage:write"],
};

export const can = (role: Role | undefined, perm: Permission) => !!role && ROLE_PERMISSIONS[role].includes(perm);
export const isStaff = (role: Role | undefined) => !!role && role !== "customer";
