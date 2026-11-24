import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Star, Trash2, ShoppingCart, Clock, Thermometer, Users, ExternalLink, CircleCheck, CircleAlert, Circle } from "lucide-react";
import { checkRecipeAgainstPantry, getRecipe } from "@/lib/food/recipes";
import { computeRecipeNutrition } from "@/lib/food/nutrition";
import { prisma } from "@/lib/db";
import { requireViewer } from "@/lib/auth/session";
import { listNotes } from "@/lib/notes";
import { today } from "@/lib/dates";
import { formatQuantity } from "@/lib/units";
import { round } from "@/lib/utils";
import { Card, CardHeader, CardBody, Badge, LinkButton, Input } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { AddMealDialog } from "@/components/food/meal-dialogs";
import { ImageUpload } from "@/components/food/image-upload";
import { toggleFavouriteAction, deleteRecipeAction, addMissingToListAction } from "../../actions";

export default async function RecipePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ servings?: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  const sp = await searchParams;
  const recipe = await getRecipe(id);
  if (!recipe) notFound();
  const servings = Number(sp.servings) > 0 ? Number(sp.servings) : recipe.servings;
  const factor = servings / recipe.servings;
  const [check, profiles, recipes, notes] = await Promise.all([
    checkRecipeAgainstPantry(id, servings),
    prisma.householdProfile.findMany({ select: { id: true, name: true } }),
    prisma.recipe.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    listNotes(viewer, { entityType: "recipe", entityId: id }),
  ]);
  const n = computeRecipeNutrition(recipe);
  const missing = check.checks.filter((c) => !c.optional && c.status !== "have");
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

        <Card>
          <CardHeader title="Ingredients" sub={<span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />checked against pantry for {servings} serving(s)</span>} action={
            <form className="flex items-center gap-2"><Input name="servings" defaultValue={servings} inputMode="decimal" className="h-9 w-16 text-center" aria-label="Servings" /><button className="h-9 rounded-lg border border-line-strong px-3 text-sm">Scale</button></form>
          } />
          <ul className="divide-y divide-line border-t border-line">
            {recipe.ingredients.map((ing, i) => {
              const c = check.checks[i];
              const icon = c.status === "have" ? <CircleCheck className="h-4 w-4 text-accent" /> : c.status === "partial" ? <CircleAlert className="h-4 w-4 text-warn" /> : c.status === "unknown" ? <Circle className="h-4 w-4 text-faint" /> : <Circle className="h-4 w-4 text-danger" />;
              return (
                <li key={ing.id} className="flex items-center gap-3 px-5 py-2.5">
                  {icon}
                  <span className="w-24 shrink-0 tabular text-muted">{ing.quantity !== null ? formatQuantity(round(ing.quantity * factor, 2), ing.unit) : "—"}</span>
                  <span className="min-w-0 flex-1">{ing.name}{ing.note ? <span className="text-faint">, {ing.note}</span> : null}{ing.optional ? <Badge className="ml-2">optional</Badge> : null}</span>
                  <span className="text-xs text-faint">{c.status === "have" ? (c.confidence !== "CONFIRMED" ? `in pantry (${c.confidence.toLowerCase()})` : "in pantry") : c.status === "partial" ? `have ${formatQuantity(round(c.available, 2), c.unit)}` : c.status === "unknown" ? "unit mismatch" : ing.quantity === null ? "" : "missing"}</span>
                </li>
              );
            })}
          </ul>
          {missing.length ? (
            <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
              <p className="text-sm text-muted">{missing.length} ingredient(s) not fully in the pantry.</p>
              <InlineAction action={addMissingToListAction} fields={{ recipeId: id, servings }} variant="outline"><ShoppingCart className="h-4 w-4" />Add missing to list</InlineAction>
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Method" />
          <CardBody>
            {recipe.instructions ? <ol className="space-y-3">{recipe.instructions.split("\n").filter(Boolean).map((s, i) => <li key={i} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-muted">{i + 1}</span><span className="leading-relaxed">{s}</span></li>)}</ol> : <p className="text-sm text-muted">No instructions yet.</p>}
            {recipe.notes ? <div className="mt-5 rounded-xl bg-surface-2 p-4 text-sm"><p className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">Notes</p><p className="whitespace-pre-wrap">{recipe.notes}</p></div> : null}
          </CardBody>
        </Card>
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
