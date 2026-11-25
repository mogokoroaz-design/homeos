"use client";
/** Last-resort error screen (when even the app frame failed). */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#0f1113", color: "#e8e6e1", fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <h2>HomeOS hit a problem</h2>
        <p style={{ color: "#a3a29d" }}>Your data is safe. Screenshot this and send it over if it keeps happening.</p>
        <pre style={{ whiteSpace: "pre-wrap", background: "#1a1d20", padding: 12, borderRadius: 8, color: "#e0b25c", fontSize: 12 }}>{error.message}{error.digest ? `\n(ref ${error.digest})` : ""}{"\n"}{(error.stack ?? "").split("\n").slice(1, 4).join("\n")}</pre>
        <button onClick={reset} style={{ padding: "10px 16px", borderRadius: 10, marginRight: 8 }}>Try again</button>
        <a href="/today" style={{ color: "#9cc2b0" }}>Go to Today</a>
      </body>
    </html>
  );
}
