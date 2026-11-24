import { z } from "zod";
import { evaluateFormula, validateFormula } from "./formula";

export const FIELD_TYPES = ["SHORT_TEXT", "LONG_TEXT", "NUMBER", "RATING", "SINGLE_SELECT", "MULTI_SELECT", "BOOLEAN", "DATE", "TIME", "DURATION", "CHECKLIST", "IMAGE", "TAGS", "FORMULA"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  SHORT_TEXT: "Short text", LONG_TEXT: "Long text", NUMBER: "Number", RATING: "Rating", SINGLE_SELECT: "Single choice",
  MULTI_SELECT: "Multiple choice", BOOLEAN: "Yes / no", DATE: "Date", TIME: "Time", DURATION: "Duration (minutes)",
  CHECKLIST: "Checklist", IMAGE: "Image", TAGS: "Tags", FORMULA: "Formula",
};

export const fieldConfig = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  unit: z.string().max(20).optional(),
  options: z.array(z.string().min(1).max(60)).max(30).optional(),
  items: z.array(z.string().min(1).max(120)).max(50).optional(),
  expression: z.string().max(300).optional(),
  placeholder: z.string().max(120).optional(),
}).strict();
export type FieldConfig = z.infer<typeof fieldConfig>;

export const fieldDef = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Keys are lowercase letters, numbers and _"),
  label: z.string().trim().min(1).max(80),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().default(false),
  config: fieldConfig.default({}),
});
export type FieldDef = z.infer<typeof fieldDef>;

export const projectDef = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(""),
  icon: z.string().max(30).default("notebook"),
  fields: z.array(fieldDef).min(1).max(40),
  reminder: z.object({ time: z.string().regex(/^\d{2}:\d{2}$/), weekdays: z.string(), message: z.string().max(120) }).nullable().default(null),
  integrations: z.array(z.object({
    kind: z.enum(["INSIGHTS_SUMMARY", "CALENDAR"]),
    metric: z.enum(["entry_count", "field_average", "field_sum"]).default("entry_count"),
    fieldKey: z.string().optional(),
    label: z.string().max(80),
  })).max(5).default([]),
}).superRefine((p, ctx) => {
  const keys = p.fields.map((f) => f.key);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "Field keys must be unique" });
  for (const f of p.fields) {
    if ((f.type === "SINGLE_SELECT" || f.type === "MULTI_SELECT") && !(f.config.options?.length)) ctx.addIssue({ code: "custom", message: `${f.label}: add at least one option` });
    if (f.type === "FORMULA") {
      const err = f.config.expression ? validateFormula(f.config.expression, keys.filter((k) => k !== f.key)) : "Formula needs an expression";
      if (err) ctx.addIssue({ code: "custom", message: `${f.label}: ${err}` });
    }
  }
});
export type ProjectDef = z.infer<typeof projectDef>;

export function keyFromLabel(label: string) {
  const k = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return /^[a-z]/.test(k) ? k : `f_${k}`.slice(0, 40);
}

export type EntryValue = string | number | boolean | string[] | { text: string; done: boolean }[] | null;

/** Validates & coerces raw form values against the project's field definitions. */
export function validateEntry(fields: { key: string; label: string; type: string; required: boolean; config: string }[], raw: Record<string, unknown>) {
  const values: Record<string, EntryValue> = {};
  const errors: string[] = [];
  const numericVars: Record<string, number | null> = {};
  for (const f of fields) {
    const cfg = fieldConfig.safeParse(JSON.parse(f.config || "{}")).data ?? {};
    const v = raw[f.key];
    const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    if (f.type === "FORMULA") continue;
    if (empty) {
      if (f.required && f.type !== "BOOLEAN") errors.push(`${f.label} is required`);
      values[f.key] = f.type === "BOOLEAN" ? false : null;
      if (["NUMBER", "RATING", "DURATION"].includes(f.type)) numericVars[f.key] = null;
      continue;
    }
    switch (f.type) {
      case "NUMBER": case "RATING": case "DURATION": {
        const n = Number(v);
        if (!Number.isFinite(n)) { errors.push(`${f.label} must be a number`); break; }
        const max = f.type === "RATING" ? cfg.max ?? 5 : cfg.max;
        const min = f.type === "RATING" ? cfg.min ?? 1 : cfg.min;
        if (min !== undefined && n < min) errors.push(`${f.label} must be ≥ ${min}`);
        if (max !== undefined && n > max) errors.push(`${f.label} must be ≤ ${max}`);
        values[f.key] = n; numericVars[f.key] = n; break;
      }
      case "BOOLEAN": values[f.key] = v === true || v === "true" || v === "on"; numericVars[f.key] = values[f.key] ? 1 : 0; break;
      case "SINGLE_SELECT":
        if (!cfg.options?.includes(String(v))) errors.push(`${f.label}: choose a valid option`);
        values[f.key] = String(v); break;
      case "MULTI_SELECT": case "TAGS": {
        const arr = Array.isArray(v) ? v.map(String) : String(v).split(",").map((s) => s.trim()).filter(Boolean);
        if (f.type === "MULTI_SELECT" && arr.some((a) => !cfg.options?.includes(a))) errors.push(`${f.label}: invalid option`);
        values[f.key] = arr; break;
      }
      case "CHECKLIST": {
        const arr = Array.isArray(v) ? v : [];
        values[f.key] = arr.map((x) => (typeof x === "object" && x ? { text: String((x as { text: unknown }).text).slice(0, 120), done: Boolean((x as { done: unknown }).done) } : { text: String(x), done: false }));
        break;
      }
      case "DATE": if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) errors.push(`${f.label}: invalid date`); values[f.key] = String(v); break;
      case "TIME": if (!/^\d{2}:\d{2}$/.test(String(v))) errors.push(`${f.label}: invalid time`); values[f.key] = String(v); break;
      case "IMAGE": values[f.key] = String(v); break; // UploadedFile id
      default: values[f.key] = String(v).slice(0, f.type === "SHORT_TEXT" ? 300 : 20000);
    }
  }
  for (const f of fields.filter((x) => x.type === "FORMULA")) {
    const cfg = JSON.parse(f.config || "{}") as FieldConfig;
    try { values[f.key] = cfg.expression ? evaluateFormula(cfg.expression, numericVars) : null; } catch { values[f.key] = null; }
  }
  return { values, errors };
}
