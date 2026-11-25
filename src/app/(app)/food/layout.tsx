import { SectionTabs } from "@/components/section-tabs";
import { KitchenBubble } from "@/components/food/kitchen-bubble";

export default function FoodLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 className="mb-4 text-[26px] font-semibold tracking-tight">Food Hub</h1>
      <SectionTabs items={[
        { href: "/food", label: "Overview", exact: true },
        { href: "/food/plan", label: "Meal plan" },
        { href: "/food/recipes", label: "Recipes" },
        { href: "/food/pantry", label: "Pantry" },
        { href: "/food/grocery", label: "Groceries" },
        { href: "/food/nutrition", label: "Nutrition" },
        { href: "/food/assistant", label: "Kitchen assistant" },
        { href: "/food/import", label: "Import" },
        { href: "/food/catalogue", label: "Ingredients" },
      ]} />
      {children}
      <KitchenBubble />
    </>
  );
}
