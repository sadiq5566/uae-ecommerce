// Watermark removal for `npm run clean-images` (and anything else that handles images): the Rimal logo by template, then any other
// watermark / logo on a plain background. The work is done by scripts/clean-worker.py (Python + opencv-python + numpy).
//
// Starting Python and importing OpenCV takes seconds, so a few worker processes are started once and reused for every picture.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";

export type AutoCleanResult =
  | { status: "cleaned"; buf: Buffer }
  | { status: "no-logo" }
  | { status: "skipped"; why: string };

const PYTHON = process.env.PYTHON ?? "python";
const MAX_WORKERS = Math.max(1, Number(process.env.WATERMARK_CONCURRENCY ?? 6));
const TIMEOUT_MS = 180_000;

class Worker {
  proc: ChildProcessWithoutNullStreams;
  busy = false;
  dead = false;
  private buf = Buffer.alloc(0);
  private pending?: { resolve: (r: AutoCleanResult) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };
  private stderr = "";

  constructor() {
    this.proc = spawn(PYTHON, ["-I", path.join(process.cwd(), "scripts", "clean-worker.py")]);
    this.proc.stdout.on("data", (d: Buffer) => this.onData(d));
    this.proc.stderr.on("data", (d: Buffer) => (this.stderr = (this.stderr + d).slice(-800)));
    this.proc.on("error", (e) => this.fail(`cannot run ${PYTHON}: ${e.message} (need python + opencv-python + numpy)`));
    this.proc.on("close", (code) => this.fail(`clean-worker.py stopped (exit ${code}): ${this.stderr.trim().split("\n").pop() ?? ""}`));
    this.proc.stdin.on("error", () => {});
  }

  private fail(message: string) {
    this.dead = true;
    if (!unavailable && /cannot run|ModuleNotFound|ImportError|No module/i.test(message + this.stderr)) unavailable = message;
    const p = this.pending;
    this.pending = undefined;
    if (p) {
      clearTimeout(p.timer);
      p.reject(new Error(message));
    }
  }

  private onData(d: Buffer) {
    this.buf = Buffer.concat([this.buf, d]);
    if (this.buf.length < 5) return;
    const len = this.buf.readUInt32BE(1);
    if (this.buf.length < 5 + len) return;
    const code = this.buf[0];
    const payload = this.buf.subarray(5, 5 + len);
    this.buf = this.buf.subarray(5 + len);
    const p = this.pending;
    this.pending = undefined;
    if (!p) return;
    clearTimeout(p.timer);
    if (code === 0) p.resolve({ status: "cleaned", buf: Buffer.from(payload) });
    else if (code === 3) p.resolve({ status: "no-logo" });
    else if (code === 4) p.resolve({ status: "skipped", why: payload.toString() || "background isn't plain" });
    else p.reject(new Error(payload.toString() || "unreadable image"));
  }

  run(input: Buffer): Promise<AutoCleanResult> {
    return new Promise((resolve, reject) => {
      if (this.dead) return reject(new Error("worker is not running"));
      const timer = setTimeout(() => {
        this.proc.kill();
        this.fail("picture took too long to process");
      }, TIMEOUT_MS);
      this.pending = { resolve, reject, timer };
      const head = Buffer.alloc(4);
      head.writeUInt32BE(input.length);
      this.proc.stdin.write(Buffer.concat([head, input]));
    });
  }
}

let unavailable = ""; // set once Python/OpenCV turned out to be missing, so every later picture fails fast
const pool: Worker[] = [];
const waiting: ((w: Worker) => void)[] = [];

function acquire(): Promise<Worker> {
  for (let i = pool.length - 1; i >= 0; i--) if (pool[i].dead) pool.splice(i, 1);
  const idle = pool.find((w) => !w.busy);
  if (idle) {
    idle.busy = true;
    return Promise.resolve(idle);
  }
  if (pool.length < MAX_WORKERS) {
    const w = new Worker();
    w.busy = true;
    pool.push(w);
    return Promise.resolve(w);
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release(w: Worker) {
  w.busy = false;
  const next = waiting.shift();
  if (next) {
    void acquire().then(next);
  }
}

/** Removes the Rimal logo (template, works on photos) and any other watermark / logo on a plain background. Rejects when Python/OpenCV can't be run. */
export async function removeAnyWatermark(input: Buffer): Promise<AutoCleanResult> {
  if (unavailable) throw new Error(unavailable);
  const w = await acquire();
  try {
    return await w.run(input);
  } finally {
    release(w);
  }
}

/** Stops the Python workers (call when the script is finished, otherwise they keep Node alive). */
export function closeWatermarkWorkers() {
  for (const w of pool) {
    w.proc.stdin.end();
    w.proc.kill();
  }
  pool.length = 0;
}
