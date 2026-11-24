import { z } from "zod";
import { isDateString } from "./dates";

export const dateString = z.string().refine(isDateString, "Invalid date (YYYY-MM-DD)");
export const optionalDate = z.union([dateString, z.literal("")]).optional().transform((v) => (v ? v : null));
export const timeString = z.union([z.string().regex(/^\d{2}:\d{2}$/), z.literal("")]).optional().transform((v) => (v ? v : null));
export const SLOTS = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;
export const slot = z.enum(SLOTS);
export const LOCATIONS = ["FRIDGE", "FREEZER", "PANTRY", "OTHER"] as const;
export const CONFIDENCE = ["CONFIRMED", "ESTIMATED", "UNVERIFIED"] as const;
export const TASK_CATEGORIES = ["CLEANING", "GARDENING", "MAINTENANCE", "LAUNDRY", "KITCHEN", "ERRAND", "OTHER"] as const;
export const PROVIDER_KINDS = ["CLEANER", "GARDENER", "PLUMBER", "ELECTRICIAN", "REPAIR", "OTHER"] as const;
export const FREQS = ["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
export const METRIC_TYPES = {
  WEIGHT: { label: "Weight", unit: "kg" },
  STEPS: { label: "Steps", unit: "steps" },
  SLEEP_HOURS: { label: "Sleep", unit: "h" },
  WATER_ML: { label: "Hydration", unit: "ml" },
  RESTING_HR: { label: "Resting heart rate", unit: "bpm" },
  ACTIVE_KCAL: { label: "Active energy", unit: "kcal" },
  ENERGY: { label: "Energy (1–5)", unit: "/5" },
  STRESS: { label: "Stress (1–5)", unit: "/5" },
} as const;
export type MetricType = keyof typeof METRIC_TYPES;

export const num = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number().finite().optional());
export const reqNum = z.preprocess((v) => (v === "" || v === null || v === undefined ? NaN : Number(v)), z.number().finite());
export const bool = z.preprocess((v) => v === "on" || v === "true" || v === true || v === "1", z.boolean());

export const scheduleInput = z.object({
  freq: z.enum(FREQS).default("NONE"),
  interval: z.preprocess((v) => (v ? Number(v) : 1), z.number().int().min(1).max(365)),
  byWeekday: z.string().default(""),
  dayOfMonth: z.preprocess((v) => (v ? Number(v) : undefined), z.number().int().min(1).max(31).optional()),
  endDate: optionalDate,
});

export function formToObject(fd: FormData) {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string") continue;
    if (k in out && k.endsWith("[]")) out[k] += "," + v;
    else out[k] = v;
  }
  // checkbox groups named like weekday[] → comma list
  return out;
}

export type ActionResult<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

export function zodMessage(err: z.ZodError) {
  return err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
}
