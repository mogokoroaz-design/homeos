import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Star, Trash2, Clock, Thermometer, ExternalLink } from "lucide-react";
import { checkRecipeAgainstPantry, getRecipe } from "@/lib/food/recipes";
import { computeRecipeNutrition } from "@/lib/food/nutrition";
import { prisma } from "@/lib/db";
import { requireViewer } from "@/lib/auth/session";
import { listNotes } from "@/lib/notes";
import { today } from "@/lib/dates";
import { Card, CardHeader, CardBody, Badge, LinkButton } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { AddMealDialog } from "@/components/food/meal-dialogs";
import { RecipeView } from "@/components/food/recipe-view";
import { ImageUpload } from "@/components/food/image-upload";
import { toggleFavouriteAction, deleteRecipeAction } from "../../actions";

export default async function RecipePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ servings?: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  const sp = await searchParams;
  const recipe = await getRecipe(id);
  if (!recipe) notFound();
  const servings = Number(sp.servings) > 0 ? Number(sp.servings) : recipe.servings;
  const [baseCheck, profiles, recipes, notes] = await Promise.all([
    checkRecipeAgainstPantry(id),
    prisma.householdProfile.findMany({ select: { id: true, name: true } }),
    prisma.recipe.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    listNotes(viewer, { entityType: "recipe", entityId: id }),
  ]);
  const n = computeRecipeNutrition(recipe);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{recipe.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
              {recipe.cuisine ? <span>{recipe.cuisine}</span> : null}
              <span>{recipe.category}</span>
              {recipe.prepMinutes ? <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />prep {recipe.prepMinutes} min</span> : null}
              {recipe.cookMinutes ? <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />cook {recipe.cookMinutes} min</span> : null}
              {recipe.temperature ? <span className="inline-flex items-center gap-1"><Thermometer className="h-3.5 w-3.5" />{recipe.temperature}</span> : null}
              {recipe.sourceUrl ? <a href={recipe.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-info hover:underline"><ExternalLink className="h-3.5 w-3.5" />source</a> : null}
              {recipe.sourceType === "AI" ? <Badge tone="warn">AI-generated</Badge> : recipe.sourceType !== "MANUAL" ? <Badge>imported · {recipe.sourceType.toLowerCase()}</Badge> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <InlineAction action={toggleFavouriteAction} fields={{ id }} variant="ghost" size="iconSm" title="Favourite"><Star className={recipe.favourite ? "h-4 w-4 fill-warn text-warn" : "h-4 w-4"} /></InlineAction>
            <AddMealDialog recipes={recipes} profiles={profiles} date={today()} recipeId={id} label="Plan" size="sm" />
            <LinkButton href={`/food/recipes/${id}/edit`} size="sm"><Pencil className="h-4 w-4" />Edit</LinkButton>
            <InlineAction action={deleteRecipeAction} fields={{ id }} variant="danger" size="iconSm" confirm="Delete this recipe? Planned meals keep their name." title="Delete"><Trash2 className="h-4 w-4" /></InlineAction>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {recipe.images.map((img) => <img key={img.id} src={`/api/files/${img.fileId}`} alt="" className="h-40 w-56 rounded-xl border border-line object-cover" />)}
          <ImageUpload endpoint={`/api/recipes/${id}/images`} />
        </div>

        <RecipeView initialServings={servings} recipe={{
          id: recipe.id, name: recipe.name, servings: recipe.servings, temperature: recipe.temperature,
          steps: recipe.instructions.split("\n").map((x) => x.trim()).filter(Boolean),
          ingredients: recipe.ingredients.map((ing, idx) => {
            const c = baseCheck.checks[idx];
            return { id: ing.id, name: ing.name, note: ing.note, optional: ing.optional, quantity: ing.quantity, unit: ing.unit, gramsPerMl: ing.foodItem?.gramsPerMl ?? null, gramsPerEach: ing.foodItem?.gramsPerEach ?? null, inPantry: c.available, pantryConfidence: c.confidence, pantryKnown: c.status !== "unknown" };
          }),
        }} />
        {recipe.notes ? <Card className="p-5 text-sm"><p className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">Notes</p><p className="whitespace-pre-wrap">{recipe.notes}</p></Card> : null}
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Nutrition per serving" sub={n.verified ? "Calculated from USDA SR28 / label data" : n.complete ? "Includes estimated values" : "Incomplete — see below"} />
          <CardBody>
            <div className="grid grid-cols-2 gap-3">
              {([["Energy", `${n.perServing.kcal} kcal`], ["Protein", `${n.perServing.protein} g`], ["Carbs", `${n.perServing.carbs} g`], ["Fat", `${n.perServing.fat} g`], ["Fibre", `${n.perServing.fibre} g`], ["Coverage", `${Math.round(n.coverage * 100)}%`]] as const).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-surface-2 px-3 py-2"><p className="text-xs text-faint">{k}</p><p className="tabular font-semibold">{v}</p></div>
              ))}
            </div>
            {n.missing.length ? (
              <div className="mt-4 text-sm">
                <p className="text-muted">Not included:</p>
                <ul className="mt-1 space-y-1 text-xs text-faint">{n.missing.map((m) => <li key={m}>• {m}</li>)}</ul>
                <Link href="/food/catalogue" className="mt-2 inline-block text-xs text-info underline">Link ingredients to reference data</Link>
              </div>
            ) : null}
            <p className="mt-3 text-[11px] text-faint">Recipe makes {recipe.servings} serving(s). Each person&apos;s planned portion is scaled from this.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Linked notes" sub="Open Notes (top bar) on this page to add one" />
          <CardBody className="space-y-2">
            {notes.length ? notes.map((note) => <div key={note.id} className="rounded-lg bg-surface-2 px-3 py-2 text-sm"><p className="font-medium">{note.title || "Note"}</p><p className="whitespace-pre-wrap text-xs text-muted">{note.body}</p></div>) : <p className="text-sm text-faint">No linked notes, e.g. substitutions you liked.</p>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
