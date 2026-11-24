import { RecipeEditor, EMPTY_RECIPE } from "@/components/food/recipe-editor";
export const metadata = { title: "New recipe" };
export default function NewRecipePage() {
  return <RecipeEditor initial={EMPTY_RECIPE} />;
}
