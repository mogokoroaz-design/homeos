import Link from "next/link";
import { requireViewer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getMealItems } from "@/lib/food/mealplan";
import { expiringSoon, lowStock } from "@/lib/food/pantry";
import { getActiveList } from "@/lib/food/grocery";
import { addDays, today, relativeDay, formatDate } from "@/lib/dates";
import { formatQuantity } from "@/lib/units";
import { formatCents } from "@/lib/money";
import { Card, CardHeader, CardBody, Stat, LinkButton, Badge } from "@/components/ui";

export const metadata = { title: "Food Hub" };

export default async function FoodOverview() {
  const viewer = await requireViewer();
  const d = today();
  const [meals, expiring, low, list, recipeCount, pantryCount, unverified] = await Promise.all([
    getMealItems(d, addDays(d, 2)), expiringSoon(4), lowStock(), getActiveList(), prisma.recipe.count(), prisma.pantryItem.count({ where: { quantity: { gt: 0 } } }),
    prisma.pantryItem.count({ where: { quantity: { gt: 0 }, confidence: { not: "CONFIRMED" } } }),
  ]);
  const grocery = await prisma.groceryItem.findMany({ where: { listId: list.id, checked: false } });
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4"><Stat label="Recipes" value={recipeCount} /></Card>
        <Card className="p-4"><Stat label="Pantry items" value={pantryCount} sub={unverified ? `${unverified} unverified` : "all confirmed"} /></Card>
        <Card className="p-4"><Stat label="To buy" value={grocery.length} sub={grocery.some((g) => g.estimatedPriceCents) ? `≈ ${formatCents(grocery.reduce((a, g) => a + (g.estimatedPriceCents ?? 0), 0), viewer.currency)}` : undefined} /></Card>
        <Card className="p-4"><Stat label="Expiring ≤ 4 days" value={expiring.length} tone={expiring.length ? "warn" : undefined} /></Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Next 3 days" action={<LinkButton href="/food/plan" size="sm" variant="ghost">Meal plan</LinkButton>} />
          <CardBody className="space-y-1.5">
            {meals.length ? meals.map((m) => <div key={m.id} className="flex items-center gap-3 text-sm"><span className="w-24 text-muted">{relativeDay(m.date)}</span><span className="w-20 text-xs uppercase text-faint">{m.slot.toLowerCase()}</span><span className="flex-1">{m.title}</span>{m.status === "COOKED" ? <Badge tone="accent">cooked</Badge> : null}</div>) : <p className="text-sm text-muted">Nothing planned. <Link href="/food/plan" className="text-info underline">Plan meals</Link></p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Use soon & running low" action={<LinkButton href="/food/pantry" size="sm" variant="ghost">Pantry</LinkButton>} />
          <CardBody className="space-y-1.5 text-sm">
            {expiring.map((p) => <div key={p.id} className="flex justify-between"><span>{p.name} <span className="text-faint">{formatQuantity(p.quantity, p.unit)}</span></span><span className={p.expiryDate! < d ? "text-danger" : "text-warn"}>{relativeDay(p.expiryDate!)}</span></div>)}
            {low.map((l) => <div key={l.name} className="flex justify-between"><span>{l.name}</span><span className="text-warn">low · {formatQuantity(l.quantity, l.unit)}</span></div>)}
            {!expiring.length && !low.length ? <p className="text-muted">Nothing urgent.</p> : null}
          </CardBody>
        </Card>
      </div>
      <p className="text-xs text-faint">Week of {formatDate(d)} · Pantry data reflects what has been recorded, not a physical check.</p>
    </div>
  );
}
