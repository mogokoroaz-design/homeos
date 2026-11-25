import { CookAlong } from "@/components/food/cook-along";
export const metadata = { title: "Cook & dictate" };
export default function DictatePage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Cook &amp; dictate</h2>
        <p className="text-sm text-muted">Talk while you cook. HomeOS times it, writes down the ingredients and steps, and puts anything you ask for on the shopping list. When you finish, you review the recipe before it’s saved.</p>
      </div>
      <CookAlong />
    </div>
  );
}
