import { notFound } from "next/navigation";
import { getRecipe } from "@/lib/food/recipes";
import { RecipeEditor } from "@/components/food/recipe-editor";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getRecipe(id);
  if (!r) notFound();
  return (
    <RecipeEditor id={r.id} initial={{
      name: r.name, cuisine: r.cuisine, category: r.category, servings: r.servings, prepMinutes: r.prepMinutes, cookMinutes: r.cookMinutes, temperature: r.temperature,
      instructions: r.instructions, sourceType: r.sourceType, sourceUrl: r.sourceUrl, notes: r.notes, tags: r.tags.split(",").filter(Boolean).join(", "), favourite: r.favourite,
      ingredients: r.ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, note: i.note, optional: i.optional, foodItemId: i.foodItemId })),
    }} />
  );
}
