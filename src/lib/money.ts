// Money is always integer minor units (cents). Never use floats for stored amounts.

export function parseMoneyToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) : null;
  const cleaned = input.replace(/[^0-9.,-]/g, "").trim();
  if (!cleaned) return null;
  // Accept "1,234.56", "1234,56" (comma decimal) and "1.234,56".
  let normalized = cleaned;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > lastDot) normalized = cleaned.replace(/\./g, "").replace(",", ".");
  else normalized = cleaned.replace(/,/g, "");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  // Round half away from zero on the decimal string to avoid binary float artefacts.
  return Math.sign(value) * Math.round(Math.abs(value) * 100 + 1e-7);
}

export function formatCents(cents: number | null | undefined, currency = "USD", opts: { compact?: boolean } = {}) {
  if (cents === null || cents === undefined) return "—";
  const value = cents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: opts.compact && Math.abs(value) >= 100 ? 0 : 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function centsToInput(cents: number | null | undefined) {
  return cents === null || cents === undefined ? "" : (cents / 100).toFixed(2);
}

export function sumCents(values: Array<number | null | undefined>) {
  return values.reduce<number>((a, b) => a + (b ?? 0), 0);
}

/** Allocates a cents total proportionally across weights without losing a cent. */
export function allocateCents(total: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (total * w) / sum);
  const floored = raw.map(Math.floor);
  let remainder = total - floored.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (remainder <= 0) break;
    floored[i]++;
    remainder--;
  }
  return floored;
}
