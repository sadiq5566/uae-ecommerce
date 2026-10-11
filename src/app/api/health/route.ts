import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Uptime probe: 200 when the app can reach MongoDB, 503 otherwise. Reveals nothing beyond up/down. */
export async function GET() {
  try {
    await connectDb();
    await mongoose.connection.db!.admin().ping();
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
