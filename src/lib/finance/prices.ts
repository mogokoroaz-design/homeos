import { prisma, type Tx } from "../db";
import { toBase, normalizeUnit, dimensionOf } from "../units";
import { addDays, today } from "../dates";
import { titleCase } from "../utils";

export interface PriceInput {
  productName: string;
  brandName?: string | null;
  variantName?: string | null;
  packageSize: number;
  packageUnit: string;
  storeName?: string | null;
  date: string;
  priceCents: number;
  regularPriceCents?: number | null;
  isPromo?: boolean;
  quantity?: number;
  source?: "RECEIPT" | "MANUAL" | "ESTIMATE" | "EXTERNAL";
  receiptItemId?: string | null;
  foodItemId?: string | null;
  category?: string;
}

export function normalizedUnitPrice(priceCents: number, packageSize: number, packageUnit: string) {
  const base = toBase(packageSize, packageUnit);
  const unit = base.dim === "other" ? "each" : base.unit;
  const qty = base.dim === "other" ? packageSize : base.qty;
  if (qty <= 0) throw new Error("Package size must be positive");
  return { normalizedUnit: unit, unitPrice: priceCents / qty };
}

export async function upsertStore(name: string | null | undefined, tx: Tx = prisma) {
  const clean = name?.trim();
  if (!clean) return null;
  const n = titleCase(clean);
  return tx.store.upsert({ where: { name: n }, create: { name: n }, update: {} });
}

export async function upsertVariant(input: Pick<PriceInput, "productName" | "brandName" | "variantName" | "packageSize" | "packageUnit" | "foodItemId" | "category">, tx: Tx = prisma) {
  const productName = titleCase(input.productName.trim());
  const product = await tx.product.upsert({
    where: { name: productName },
    create: { name: productName, foodItemId: input.foodItemId ?? null, category: input.category ?? "groceries" },
    update: input.foodItemId ? { foodItemId: input.foodItemId } : {},
  });
  const brandName = input.brandName?.trim();
  const brand = brandName ? await tx.brand.upsert({ where: { name: titleCase(brandName) }, create: { name: titleCase(brandName) }, update: {} }) : null;
  const unit = normalizeUnit(input.packageUnit);
  const variantName = input.variantName?.trim() ?? "";
  const existing = await tx.productVariant.findFirst({
    where: { productId: product.id, brandId: brand?.id ?? null, variantName, packageSize: input.packageSize, packageUnit: unit },
  });
  return existing ?? tx.productVariant.create({ data: { productId: product.id, brandId: brand?.id ?? null, variantName, packageSize: input.packageSize, packageUnit: unit } });
}

/** Appends a historical price record. Never overwrites earlier prices. */
export async function recordPrice(input: PriceInput, tx: Tx = prisma) {
  const variant = await upsertVariant(input, tx);
  const store = await upsertStore(input.storeName, tx);
  const { normalizedUnit, unitPrice } = normalizedUnitPrice(input.priceCents, input.packageSize, input.packageUnit);
  return tx.priceRecord.create({
    data: {
      variantId: variant.id,
      storeId: store?.id ?? null,
      date: input.date,
      priceCents: input.priceCents,
      regularPriceCents: input.regularPriceCents ?? null,
      isPromo: input.isPromo ?? false,
      quantity: input.quantity ?? 1,
      normalizedUnit,
      unitPrice,
      source: input.source ?? "MANUAL",
      receiptItemId: input.receiptItemId ?? null,
    },
  });
}

/** Best (lowest unit price) recent recorded price for a food item, used for grocery estimates. */
export async function bestRecentPriceForFood(foodItemId: string, withinDays = 365, tx: Tx = prisma) {
  const since = addDays(today(), -withinDays);
  const records = await tx.priceRecord.findMany({
    where: { date: { gte: since }, variant: { product: { foodItemId } } },
    include: { variant: { include: { brand: true, product: true } }, store: true },
    orderBy: { date: "desc" },
  });
  const latestPerVariant = new Map<string, (typeof records)[number]>();
  for (const r of records) if (!latestPerVariant.has(r.variantId)) latestPerVariant.set(r.variantId, r);
  const list = [...latestPerVariant.values()].sort((a, b) => a.unitPrice - b.unitPrice);
  return list[0] ?? null;
}

export async function priceIndexForFoods(foodItemIds: string[], tx: Tx = prisma) {
  const out = new Map<string, Awaited<ReturnType<typeof bestRecentPriceForFood>>>();
  for (const id of new Set(foodItemIds)) out.set(id, await bestRecentPriceForFood(id, 365, tx));
  return out;
}

export interface VariantStats {
  variantId: string;
  label: string;
  brand: string | null;
  packageSize: number;
  packageUnit: string;
  normalizedUnit: string;
  latest: { unitPrice: number; priceCents: number; date: string; store: string | null; isPromo: boolean; source: string };
  min: { unitPrice: number; date: string; store: string | null };
  avgUnitPrice: number;
  count: number;
  changePct: number | null; // latest vs first record within the window
  history: { date: string; unitPrice: number; priceCents: number; store: string | null; isPromo: boolean; source: string }[];
}

export async function productComparison(productId: string): Promise<{ product: { id: string; name: string }; variants: VariantStats[]; stores: { store: string; minUnitPrice: number; normalizedUnit: string }[] }> {
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    include: { variants: { include: { brand: true, priceRecords: { include: { store: true }, orderBy: { date: "asc" } } } } },
  });
  const variants: VariantStats[] = [];
  const storeMin = new Map<string, { minUnitPrice: number; normalizedUnit: string }>();
  for (const v of product.variants) {
    if (!v.priceRecords.length) continue;
    const recs = v.priceRecords;
    const latest = recs[recs.length - 1];
    const min = recs.reduce((a, b) => (b.unitPrice < a.unitPrice ? b : a));
    for (const r of recs) {
      const key = `${r.store?.name ?? "Unknown store"}|${r.normalizedUnit}`;
      const cur = storeMin.get(key);
      if (!cur || r.unitPrice < cur.minUnitPrice) storeMin.set(key, { minUnitPrice: r.unitPrice, normalizedUnit: r.normalizedUnit });
    }
    variants.push({
      variantId: v.id,
      label: [v.brand?.name ?? "Unbranded", v.variantName, `${v.packageSize} ${v.packageUnit}`].filter(Boolean).join(" · "),
      brand: v.brand?.name ?? null,
      packageSize: v.packageSize,
      packageUnit: v.packageUnit,
      normalizedUnit: latest.normalizedUnit,
      latest: { unitPrice: latest.unitPrice, priceCents: latest.priceCents, date: latest.date, store: latest.store?.name ?? null, isPromo: latest.isPromo, source: latest.source },
      min: { unitPrice: min.unitPrice, date: min.date, store: min.store?.name ?? null },
      avgUnitPrice: recs.reduce((a, b) => a + b.unitPrice, 0) / recs.length,
      count: recs.length,
      changePct: recs.length > 1 ? ((latest.unitPrice - recs[0].unitPrice) / recs[0].unitPrice) * 100 : null,
      history: recs.map((r) => ({ date: r.date, unitPrice: r.unitPrice, priceCents: r.priceCents, store: r.store?.name ?? null, isPromo: r.isPromo, source: r.source })),
    });
  }
  variants.sort((a, b) => a.latest.unitPrice - b.latest.unitPrice);
  return {
    product: { id: product.id, name: product.name },
    variants,
    stores: [...storeMin.entries()].map(([k, v]) => ({ store: k.split("|")[0], ...v })).sort((a, b) => a.minUnitPrice - b.minUnitPrice),
  };
}

/** Products whose latest unit price is higher than their first recorded price in the window. */
export async function priceChanges(windowDays = 365) {
  const since = addDays(today(), -windowDays);
  const records = await prisma.priceRecord.findMany({
    where: { date: { gte: since }, source: { in: ["RECEIPT", "MANUAL"] } },
    include: { variant: { include: { product: true, brand: true } } },
    orderBy: { date: "asc" },
  });
  const byVariant = new Map<string, typeof records>();
  for (const r of records) byVariant.set(r.variantId, [...(byVariant.get(r.variantId) ?? []), r]);
  const out = [] as { product: string; productId: string; variant: string; first: number; latest: number; changePct: number; firstDate: string; latestDate: string; normalizedUnit: string }[];
  for (const recs of byVariant.values()) {
    if (recs.length < 2) continue;
    const first = recs[0], latest = recs[recs.length - 1];
    if (first.date === latest.date) continue;
    out.push({
      product: first.variant.product.name,
      productId: first.variant.productId,
      variant: [first.variant.brand?.name, `${first.variant.packageSize} ${first.variant.packageUnit}`].filter(Boolean).join(" "),
      first: first.unitPrice,
      latest: latest.unitPrice,
      changePct: ((latest.unitPrice - first.unitPrice) / first.unitPrice) * 100,
      firstDate: first.date,
      latestDate: latest.date,
      normalizedUnit: latest.normalizedUnit,
    });
  }
  return out.sort((a, b) => b.changePct - a.changePct);
}

/**
 * Estimated savings from switching to the cheapest recorded variant of each product, based on what
 * the household actually bought in the window (quantity × package size × unit-price difference).
 * Only compares variants whose prices normalise to the same base unit.
 */
export async function brandSwitchSavings(windowDays = 90) {
  const since = addDays(today(), -windowDays);
  const products = await prisma.product.findMany({
    include: { variants: { include: { brand: true, priceRecords: { orderBy: { date: "desc" } } } } },
  });
  const out = [] as { product: string; productId: string; cheapest: string; cheapestUnitPrice: number; normalizedUnit: string; spentCents: number; potentialSavingsCents: number }[];
  for (const p of products) {
    const priced = p.variants.filter((v) => v.priceRecords.length);
    if (priced.length < 2) continue;
    const byUnit = new Map<string, typeof priced>();
    for (const v of priced) {
      const u = v.priceRecords[0].normalizedUnit;
      byUnit.set(u, [...(byUnit.get(u) ?? []), v]);
    }
    for (const [unit, vs] of byUnit) {
      if (vs.length < 2) continue;
      const cheapest = vs.reduce((a, b) => (b.priceRecords[0].unitPrice < a.priceRecords[0].unitPrice ? b : a));
      const cheapestPrice = cheapest.priceRecords[0].unitPrice;
      let spent = 0, savings = 0;
      for (const v of vs) {
        for (const r of v.priceRecords.filter((r) => r.date >= since && r.source !== "ESTIMATE")) {
          const qtyBase = toBase(v.packageSize, v.packageUnit).qty * r.quantity;
          spent += r.priceCents * r.quantity;
          savings += Math.max(0, (r.unitPrice - cheapestPrice) * qtyBase);
        }
      }
      if (spent > 0) out.push({ product: p.name, productId: p.id, cheapest: [cheapest.brand?.name ?? "Unbranded", `${cheapest.packageSize} ${cheapest.packageUnit}`].join(" "), cheapestUnitPrice: cheapestPrice, normalizedUnit: unit, spentCents: spent, potentialSavingsCents: Math.round(savings) });
    }
  }
  return out.sort((a, b) => b.potentialSavingsCents - a.potentialSavingsCents);
}

export function isComparableUnit(a: string, b: string) {
  return dimensionOf(a) === dimensionOf(b) && dimensionOf(a) !== "other";
}
