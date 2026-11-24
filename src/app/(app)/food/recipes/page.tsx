import Link from "next/link";
import { Plus, Star, Clock, BookOpen, Download } from "lucide-react";
import { listRecipes } from "@/lib/food/recipes";
import { Card, Badge, Input, LinkButton, Empty, Select } from "@/components/ui";

export const metadata = { title: "Recipes" };

export default async function RecipesPage({ searchParams }: { searchParams: Promise<{ q?: string; fav?: string; category?: string }> }) {
  const sp = await searchParams;
  const recipes = await listRecipes({ q: sp.q, favourite: sp.fav === "1", category: sp.category || undefined });
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <form className="flex flex-1 flex-wrap gap-2">
          <Input name="q" defaultValue={sp.q} placeholder="Search recipes, ingredients, tags…" className="max-w-sm" />
          <Select name="category" defaultValue={sp.category ?? ""} className="w-36"><option value="">All types</option>{["breakfast", "main", "side", "salad", "soup", "snack", "dessert", "drink", "sauce", "other"].map((c) => <option key={c}>{c}</option>)}</Select>
          <label className="flex items-center gap-2 px-2 text-sm text-muted"><input type="checkbox" name="fav" value="1" defaultChecked={sp.fav === "1"} className="accent-[#9cc2b0]" />Favourites</label>
          <button className="h-11 rounded-xl border border-line-strong px-4 text-sm">Filter</button>
        </form>
        <LinkButton href="/food/import" variant="secondary"><Download className="h-4 w-4" />Import</LinkButton>
        <LinkButton href="/food/recipes/new" variant="primary"><Plus className="h-4 w-4" />New recipe</LinkButton>
      </div>
      {recipes.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {recipes.map((r) => (
            <Link key={r.id} href={`/food/recipes/${r.id}`}>
              <Card className="h-full overflow-hidden transition-colors hover:border-line-strong">
                {r.images[0] ? <img src={`/api/files/${r.images[0].fileId}`} alt="" className="h-36 w-full object-cover" /> : <div className="flex h-24 items-center justify-center bg-surface-2 text-faint"><BookOpen className="h-6 w-6" /></div>}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-snug">{r.name}</p>
                    {r.favourite ? <Star className="h-4 w-4 shrink-0 fill-warn text-warn" /> : null}
                  </div>
                  <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                    {r.cuisine ? <span>{r.cuisine}</span> : null}<span>{r.category}</span>
                    {r.prepMinutes || r.cookMinutes ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{(r.prepMinutes ?? 0) + (r.cookMinutes ?? 0)} min</span> : null}
                    <span>{r.ingredients.length} ingredients</span>
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {r.nutrition.complete ? <Badge tone={r.nutrition.verified ? "accent" : "neutral"}>{r.nutrition.perServing.kcal} kcal/serving{r.nutrition.verified ? "" : " est."}</Badge> : <Badge>nutrition incomplete</Badge>}
                    {r.sourceType === "AI" ? <Badge tone="warn">AI</Badge> : null}
                    {r.tags.split(",").filter(Boolean).slice(0, 3).map((t) => <Badge key={t}>#{t}</Badge>)}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Empty icon={<BookOpen className="h-7 w-7" />} title={sp.q ? "No recipes match" : "Your recipe library is empty"} action={<div className="flex gap-2"><LinkButton href="/food/recipes/new" variant="primary">Create a recipe</LinkButton><LinkButton href="/food/import">Import one</LinkButton></div>}>
          Recipes power meal planning, grocery lists and the kitchen assistant.
        </Empty>
      )}
    </>
  );
}
