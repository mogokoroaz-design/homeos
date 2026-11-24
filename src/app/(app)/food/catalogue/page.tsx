import { prisma } from "@/lib/db";
import { Card, Badge, Input, Empty } from "@/components/ui";
import { LinkReferenceDialog, EditFoodDialog } from "@/components/food/catalogue-forms";

export const metadata = { title: "Ingredients" };

export default async function CataloguePage({ searchParams }: { searchParams: Promise<{ q?: string; missing?: string }> }) {
  const sp = await searchParams;
  const foods = await prisma.foodItem.findMany({ where: { ...(sp.q ? { name: { contains: sp.q } } : {}), ...(sp.missing === "1" ? { kcalPer100g: null } : {}) }, include: { aliases: true, _count: { select: { recipeIngredients: true } } }, orderBy: { name: "asc" } });
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted">Your household&apos;s ingredient catalogue. Link items to the bundled USDA SR28 database (8,789 foods, public domain) or enter label values so recipes and food logs can calculate nutrition. Values are never guessed.</p>
      <form className="flex flex-wrap items-center gap-3">
        <Input name="q" defaultValue={sp.q} placeholder="Search ingredients" className="max-w-xs" />
        <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" name="missing" value="1" defaultChecked={sp.missing === "1"} className="accent-[#9cc2b0]" />Missing nutrition only</label>
        <button className="h-11 rounded-xl border border-line-strong px-4 text-sm">Filter</button>
      </form>
      {foods.length ? (
        <Card>
          <ul className="divide-y divide-line">
            {foods.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-48 flex-1">
                  <p className="font-medium">{f.name}</p>
                  <p className="text-xs text-faint">{f.category} · buys in {f.defaultUnit}{f.gramsPerEach ? ` · ${f.gramsPerEach} g each` : ""}{f.gramsPerMl ? ` · ${f.gramsPerMl} g/ml` : ""}{f._count.recipeIngredients ? ` · used in ${f._count.recipeIngredients} recipe(s)` : ""}{f.aliases.length ? ` · aka ${f.aliases.map((a) => a.name).join(", ")}` : ""}</p>
                </div>
                {f.kcalPer100g !== null ? <span className="text-sm tabular text-muted">{Math.round(f.kcalPer100g)} kcal/100 g</span> : null}
                <Badge tone={f.nutritionSource === "USDA_SR28" || f.nutritionSource === "LABEL" ? "accent" : f.nutritionSource ? "warn" : "neutral"}>{f.nutritionSource === "USDA_SR28" ? `USDA ${f.usdaNdb}` : f.nutritionSource === "LABEL" ? "label" : f.nutritionSource === "USER_ESTIMATE" ? "estimate" : "no nutrition"}</Badge>
                <LinkReferenceDialog food={{ id: f.id, name: f.name, category: f.category, defaultUnit: f.defaultUnit, gramsPerMl: f.gramsPerMl, gramsPerEach: f.gramsPerEach, kcal: f.kcalPer100g, protein: f.proteinPer100g, carbs: f.carbsPer100g, fat: f.fatPer100g, fibre: f.fibrePer100g, barcode: f.barcode, source: f.nutritionSource }} />
                <EditFoodDialog food={{ id: f.id, name: f.name, category: f.category, defaultUnit: f.defaultUnit, gramsPerMl: f.gramsPerMl, gramsPerEach: f.gramsPerEach, kcal: f.kcalPer100g, protein: f.proteinPer100g, carbs: f.carbsPer100g, fat: f.fatPer100g, fibre: f.fibrePer100g, barcode: f.barcode, source: f.nutritionSource }} />
              </li>
            ))}
          </ul>
        </Card>
      ) : <Empty title="No ingredients yet">Ingredients are added automatically from recipes, the pantry and receipts.</Empty>}
    </div>
  );
}
