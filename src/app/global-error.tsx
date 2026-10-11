"use client";

// Last-resort boundary (errors in the root layout). Must render its own <html>/<body>.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, textAlign: "center", padding: 24 }}>
        <div role="alert">
          <h1>Something went wrong · حدث خطأ ما</h1>
          <p>Please try again. · يرجى المحاولة مرة أخرى.</p>
          <button onClick={reset} style={{ padding: "12px 24px", borderRadius: 999, border: 0, background: "#0b6b57", color: "#fff", fontSize: 16, cursor: "pointer" }}>Try again · حاول مجدداً</button>
        </div>
      </body>
    </html>
  );
}
