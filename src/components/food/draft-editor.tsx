"use client";
import { useEffect, useState } from "react";
import { cleanDraft } from "@/lib/food/draft";
import { RecipeEditor, EMPTY_RECIPE, type EditorRecipe } from "./recipe-editor";

/** New-recipe editor, optionally prefilled from an adaptation draft kept in sessionStorage. */
export function DraftRecipeEditor({ fromDraft }: { fromDraft: boolean }) {
  const [initial, setInitial] = useState<EditorRecipe | null>(fromDraft ? null : EMPTY_RECIPE);
  useEffect(() => {
    if (!fromDraft) return;
    try {
      const raw = sessionStorage.getItem("homeos.recipeDraft");
      setInitial(raw ? { ...EMPTY_RECIPE, ...cleanDraft(JSON.parse(raw)) } : EMPTY_RECIPE);
    } catch { setInitial(EMPTY_RECIPE); }
  }, [fromDraft]);
  if (!initial) return <p className="text-sm text-muted">Loading draft…</p>;
  return <RecipeEditor key={initial.name} initial={initial} />;
}
