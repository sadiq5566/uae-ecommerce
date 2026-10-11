import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_UPLOAD_BYTES, getStorage, sniffImage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Image upload for staff who can edit catalogue or content. Validates real file type + size; stores via the storage adapter. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !(can(user.role, "products:write") || can(user.role, "categories:write") || can(user.role, "articles:write") || can(user.role, "homepage:write") || can(user.role, "settings:write"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  if (!(await rateLimit(`upload:${user.id}`, 60, 600)).ok) return NextResponse.json({ error: "Too many uploads" }, { status: 429 });
  const storage = getStorage();
  if (!storage) return NextResponse.json({ error: "No image storage is configured for this environment. Add a storage adapter (see docs) or paste an allowed image URL." }, { status: 501 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Image must be 4 MB or smaller" }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = sniffImage(buf);
  if (!ext) return NextResponse.json({ error: "Only PNG, JPEG or WebP images are allowed" }, { status: 415 });
  return NextResponse.json(await storage.put(buf, ext));
}
