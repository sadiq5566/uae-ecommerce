// Generic watermark removal (any position, any wording) - wraps scripts/remove-watermark.py (Python + opencv-python + numpy).
// Shared by `npm run clean-images` and anything else that handles images (e.g. the admin upload route).
import { spawn } from "node:child_process";
import path from "node:path";

export type AutoCleanResult =
  | { status: "cleaned"; buf: Buffer }
  | { status: "no-logo" }
  | { status: "skipped"; why: string };

const PYTHON = process.env.PYTHON ?? "python";

/** Finds watermark(s) anywhere on a plain background and paints them out. Rejects (throws) when Python/OpenCV can't be run. */
export function removeAnyWatermark(input: Buffer): Promise<AutoCleanResult> {
  return new Promise((resolve, reject) => {
    const py = spawn(PYTHON, ["-I", path.join(process.cwd(), "scripts", "remove-watermark.py"), "--stdio"]);
    const out: Buffer[] = [];
    let err = "";
    py.stdout.on("data", (d) => out.push(d));
    py.stderr.on("data", (d) => (err += d));
    py.on("error", (e) => reject(new Error(`cannot run ${PYTHON}: ${e.message} (need python + opencv-python + numpy)`)));
    py.on("close", (code) => {
      if (code === 0 && out.length) resolve({ status: "cleaned", buf: Buffer.concat(out) });
      else if (code === 3) resolve({ status: "no-logo" });
      else if (code === 4) resolve({ status: "skipped", why: err.trim() || "background isn't plain" });
      else reject(new Error(`remove-watermark.py exit ${code}: ${err.trim().split("\n").pop()}`));
    });
    py.stdin.on("error", () => {});
    py.stdin.end(input);
  });
}
