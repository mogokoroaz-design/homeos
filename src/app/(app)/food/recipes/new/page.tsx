import { DraftRecipeEditor } from "@/components/food/draft-editor";
export const metadata = { title: "New recipe" };
export default async function NewRecipePage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const { draft } = await searchParams;
  return <DraftRecipeEditor fromDraft={draft === "1"} />;
}
