"use client";
import { useEffect } from "react";
import Link from "next/link";

/** Shown instead of a blank "Application error" screen: the real message, plus ways out. Nothing is lost. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-2xl border border-line-strong bg-surface p-6" role="alert">
      <h2 className="text-lg font-semibold">This page hit a problem</h2>
      <p className="text-sm text-muted">Your data is safe — nothing was changed. If it keeps happening, take a screenshot of this box and send it over.</p>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs text-warn">{error.message || "Unknown error"}{error.digest ? `\n(ref ${error.digest})` : ""}{"\n"}{(error.stack ?? "").split("\n").slice(1, 4).join("\n")}</pre>
      <p className="text-xs text-faint">Page: {typeof window !== "undefined" ? window.location.pathname : ""} · Version {process.env.NEXT_PUBLIC_HOMEOS_VERSION}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={reset} className="h-11 rounded-xl bg-accent px-4 font-medium text-[#0d1512]">Try again</button>
        <button type="button" onClick={() => window.location.reload()} className="h-11 rounded-xl border border-line-strong px-4">Reload</button>
        <Link href="/today" className="inline-flex h-11 items-center rounded-xl border border-line-strong px-4">Go to Today</Link>
      </div>
    </div>
  );
}
