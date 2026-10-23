import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { getCurrentUser } from "../src/lib/auth/session";
import { can } from "../src/lib/auth/permissions";
import { connectDb } from "../src/lib/db";

/** Runs an admin API handler behind auth (products:write) + same-origin checks, with uniform error output. Same contract as the other storefronts. */
export async function adminRoute(req: Request, fn: () => Promise<NextResponse>) {
  if (req.method !== "GET") {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (origin && host && new URL(origin).host !== host) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user || !can(user.role, "products:write")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDb();
    return await fn();
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues[0].message, issues: e.issues }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export const refreshStore = () => revalidatePath("/", "layout");
