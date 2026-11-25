import Link from "next/link";
import { DraftRecipeEditor } from "@/components/food/draft-editor";
export const metadata = { title: "New recipe" };
export default async function NewRecipePage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const { draft } = await searchParams;
  return (
    <div className="space-y-4">
      {draft !== "1" ? <p className="text-sm text-muted">Cooking right now? <Link href="/food/recipes/dictate" className="text-info hover:underline">Cook &amp; dictate</Link> — talk instead of typing and HomeOS writes the recipe as you go.</p> : null}
      <DraftRecipeEditor fromDraft={draft === "1"} />
    </div>
  );
}
