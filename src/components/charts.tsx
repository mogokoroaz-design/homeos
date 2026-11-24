"use client";
// Chart primitives. Categorical colours are a fixed-order palette validated (CVD + contrast)
// against the app's dark surface #111316; series take slots in order, never cycled.
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend } from "recharts";

export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c", "#9085e9", "#e66767"];
export type Fmt = "money" | "number" | "kcal" | "kg" | "min" | "pct";
export type XFmt = "date" | "month" | "week";
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtFn(f: Fmt = "number", currency = "USD") {
  return (v: number) => {
    if (f === "money") return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: Math.abs(v) >= 10000 ? 0 : 2 }).format(v / 100);
    const r = Math.round(v * 10) / 10;
    return f === "kcal" ? `${Math.round(v)}` : f === "kg" ? `${r} kg` : f === "min" ? `${Math.round(v)} min` : f === "pct" ? `${Math.round(v)}%` : String(r);
  };
}
function xFn(f?: XFmt) {
  if (!f) return undefined;
  return (v: string) => (f === "month" ? `${MO[Number(v.slice(5, 7)) - 1]} ${v.slice(2, 4)}` : `${MO[Number(v.slice(5, 7)) - 1]} ${Number(v.slice(8, 10))}`);
}
const AXIS = { stroke: "#636b77", fontSize: 11, tickLine: false, axisLine: false } as const;
const GRID = { stroke: "#24282f", strokeDasharray: "0", vertical: false } as const;

function TooltipBox({ active, payload, label, format, labelFormat }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; format: (v: number) => string; labelFormat?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line-strong bg-surface-3 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 text-muted">{labelFormat ? labelFormat(String(label)) : label}</p>
      {payload.filter((p) => p.value !== null && p.value !== undefined).map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-ink"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}: <span className="tabular font-medium">{format(p.value)}</span></p>
      ))}
    </div>
  );
}

export function TrendLine({ data, x, series, height = 220, fmt, currency, reference, referenceLabel, xFmt, yDomain }: {
  data: Record<string, string | number | null>[]; x: string; series: { key: string; name: string }[]; height?: number; fmt?: Fmt; currency?: string;
  reference?: number | null; referenceLabel?: string; xFmt?: XFmt; yDomain?: [number | "auto" | "dataMin", number | "auto" | "dataMax"];
}) {
  const format = fmtFn(fmt, currency);
  const xFormat = xFn(xFmt);
  return (
    <div style={{ height }} role="img" aria-label={series.map((s) => s.name).join(", ")}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey={x} {...AXIS} tickFormatter={xFormat} minTickGap={24} />
          <YAxis {...AXIS} tickFormatter={(v) => format(Number(v))} width={52} domain={yDomain ?? ["auto", "auto"]} />
          <Tooltip cursor={{ stroke: "#323840" }} content={<TooltipBox format={format} labelFormat={xFormat} />} />
          {reference ? <ReferenceLine y={reference} stroke="#9098a5" strokeDasharray="4 4" label={{ value: referenceLabel, fill: "#9098a5", fontSize: 11, position: "insideTopRight" }} /> : null}
          {series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={SERIES[i]} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: SERIES[i] }} activeDot={{ r: 5, stroke: "#111316", strokeWidth: 2 }} connectNulls />)}
          {series.length > 1 ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "#9098a5" }} /> : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Bars({ data, x, series, height = 220, fmt, currency, stacked, xFmt, reference, referenceLabel }: {
  data: Record<string, string | number | null>[]; x: string; series: { key: string; name: string; color?: string }[]; height?: number; fmt?: Fmt; currency?: string;
  stacked?: boolean; xFmt?: XFmt; reference?: number | null; referenceLabel?: string;
}) {
  const format = fmtFn(fmt, currency);
  const xFormat = xFn(xFmt);
  return (
    <div style={{ height }} role="img" aria-label={series.map((s) => s.name).join(", ")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }} barCategoryGap="28%">
          <CartesianGrid {...GRID} />
          <XAxis dataKey={x} {...AXIS} tickFormatter={xFormat} minTickGap={8} />
          <YAxis {...AXIS} tickFormatter={(v) => format(Number(v))} width={56} />
          <Tooltip cursor={{ fill: "#1d2126" }} content={<TooltipBox format={format} labelFormat={xFormat} />} />
          {reference ? <ReferenceLine y={reference} stroke="#9098a5" strokeDasharray="4 4" label={{ value: referenceLabel, fill: "#9098a5", fontSize: 11, position: "insideTopRight" }} /> : null}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color ?? SERIES[i]} stackId={stacked ? "a" : undefined} stroke="#111316" strokeWidth={stacked ? 1 : 0}
              radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]} maxBarSize={36} />
          ))}
          {series.length > 1 ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "#9098a5" }} /> : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
