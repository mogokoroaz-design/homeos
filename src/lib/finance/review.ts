import { centsToInput } from "../money";

export interface ReviewItem { name: string; quantity: number; unit: string; unitPrice: string; total: string; brand: string; packageSize: string; packageUnit: string; recordPrice: boolean; addToPantry: boolean }
export interface ReviewData { merchant: string; storeName: string; date: string; total: string; tax: string; subtotal: string; categoryKey: string; paymentNote: string; items: ReviewItem[] }

export function toReviewData(r: { merchant: string; date: string | null; totalCents: number | null; taxCents: number | null; subtotalCents: number | null; categoryKey: string; paymentNote: string; items: { name: string; quantity: number; unit: string; unitPriceCents: number | null; totalCents: number }[] }): ReviewData {
  return {
    merchant: r.merchant, storeName: "", date: r.date ?? "", total: centsToInput(r.totalCents), tax: centsToInput(r.taxCents), subtotal: centsToInput(r.subtotalCents), categoryKey: r.categoryKey, paymentNote: r.paymentNote,
    items: r.items.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, unitPrice: centsToInput(i.unitPriceCents), total: centsToInput(i.totalCents), brand: "", packageSize: "", packageUnit: "g", recordPrice: true, addToPantry: r.categoryKey === "groceries" })),
  };
}
