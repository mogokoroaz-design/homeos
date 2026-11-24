import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { RecipeEditor, EMPTY_RECIPE, type EditorRecipe } from "@/components/food/recipe-editor";
import { Card, CardBody, Badge, LinkButton } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { discardImportAction, reextractImportAction } from "../../actions";

export default async function ImportReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const imp = await prisma.recipeImport.findUnique({ where: { id } });
  if (!imp) notFound();
  const draft = JSON.parse(imp.extracted || "{}") as Partial<EditorRecipe>;
  const warnings = JSON.parse(imp.warnings || "[]") as string[];
  const initial: EditorRecipe = { ...EMPTY_RECIPE, ...draft, category: draft.category ?? "main", favourite: false, sourceType: draft.sourceType ?? imp.method, sourceUrl: draft.sourceUrl ?? imp.sourceUrl, ingredients: draft.ingredients ?? [] };
  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Review imported recipe</h2>
            <Badge>{imp.method.toLowerCase()}</Badge>
            <Badge tone={imp.status === "FAILED" ? "danger" : imp.status === "SAVED" ? "accent" : "warn"}>{imp.status === "PENDING_REVIEW" ? "needs review" : imp.status.toLowerCase()}</Badge>
            <div className="ml-auto flex gap-2">
              {imp.status !== "SAVED" && imp.rawText ? <InlineAction action={reextractImportAction} fields={{ id }} variant="outline">Re-extract</InlineAction> : null}
              {imp.status !== "SAVED" ? <InlineAction action={discardImportAction} fields={{ id }} variant="ghost">Discard</InlineAction> : null}
              <LinkButton href="/food/import" size="sm" variant="ghost">Try another method</LinkButton>
            </div>
          </div>
          {warnings.length || imp.error ? <ul className="mt-3 space-y-1 text-sm text-warn">{imp.error ? <li>• {imp.error}</li> : null}{warnings.map((w) => <li key={w}>• {w}</li>)}</ul> : null}
          <p className="mt-2 text-sm text-muted">Check names, quantities and units carefully — extraction is never saved without your approval.</p>
          {imp.rawText ? <details className="mt-3"><summary className="cursor-pointer text-sm text-muted">Show extracted source text</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs text-muted">{imp.rawText}</pre></details> : null}
        </CardBody>
      </Card>
      {imp.status === "SAVED" && imp.recipeId ? <LinkButton href={`/food/recipes/${imp.recipeId}`} variant="primary">Open saved recipe</LinkButton> : <RecipeEditor key={imp.extracted} initial={initial} importId={id} />}
    </div>
  );
}
