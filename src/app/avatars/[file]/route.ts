import { connectDb } from "@/lib/db";
import { Avatar } from "@/models/avatar";

/**
 * Serves a profile picture at /avatars/<userId>.jpg?v=<version> (outside /api on purpose: /api/* is sent "no-store"). The URL carries the version, so it
 * can be cached for a long time and still refresh after a change. The real type is in Content-Type whatever the extension says.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const id = (await ctx.params).file.replace(/\.(jpg|png|webp)$/i, "");
  if (!/^[a-f0-9]{24}$/.test(id)) return new Response("not found", { status: 404 });
  await connectDb();
  const a = await Avatar.findOne({ user: id }).lean();
  if (!a) return new Response("not found", { status: 404 });
  // lean() hands back a BSON Binary; its bytes are on `.buffer`
  const raw = a.data as unknown as { buffer?: Uint8Array } & Uint8Array;
  return new Response(new Uint8Array(raw.buffer ?? raw), { headers: { "Content-Type": a.contentType, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
