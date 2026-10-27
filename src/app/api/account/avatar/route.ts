import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { sniffImage } from "@/lib/storage";
import { Avatar } from "@/models/avatar";
import { User } from "@/models/user";

const MAX_BYTES = 200 * 1024; // the browser sends a ~256 px picture, normally 20–60 KB
const TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;

/** Upload or replace the signed-in customer's picture. The real image type is read from the bytes, never from the file name. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  if (!(await rateLimit(`avatar:${user.id}`, 20, 3600)).ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(buf);
  if (!kind) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await connectDb();
  const version = Date.now();
  await Avatar.updateOne({ user: user.id }, { $set: { contentType: TYPES[kind], data: buf, version } }, { upsert: true });
  await User.updateOne({ _id: user.id }, { $set: { avatarVersion: version } });
  return NextResponse.json({ ok: true, url: `/avatars/${user.id}.jpg?v=${version}` });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  await connectDb();
  await Avatar.deleteOne({ user: user.id });
  await User.updateOne({ _id: user.id }, { $unset: { avatarVersion: 1 } });
  return NextResponse.json({ ok: true });
}
