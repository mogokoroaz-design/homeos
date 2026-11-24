import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import type { ActionResult } from "./validation";
import { zodMessage } from "./validation";

/** Wraps a server-action body: maps errors to ActionResult and revalidates the app. */
export async function run<T>(fn: () => Promise<T>, message?: string | ((r: T) => string)): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    revalidatePath("/", "layout");
    return { ok: true, data, message: typeof message === "function" ? message(data) : message };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof ZodError) return { ok: false, error: zodMessage(e) };
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

/** For fire-and-forget form actions (toggles, deletes). */
export async function runVoid(fn: () => Promise<unknown>) {
  const r = await run(fn);
  if (!r.ok) throw new Error(r.error);
}
