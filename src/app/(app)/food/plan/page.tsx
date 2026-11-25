import Link from "next/link";
import { ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { requireViewer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getMealItems } from "@/lib/food/mealplan";
import { computeRequirements, estimatePrice } from "@/lib/food/grocery";
import { currentTargets } from "@/lib/food/targets";
import { addDays, startOfWeek, today, dateRange, formatDate, weekday, weekdayName, monthOf, monthRange, addMonthsToMonth, formatMonth, isDateString } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Card, CardHeader, CardBody, LinkButton, Badge, buttonClass } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { MealCard } from "@/components/food/meal-card";
import { AddMealDialog } from "@/components/food/meal-dialogs";
import { PlanAssistant } from "@/components/food/plan-assistant";
import { copyWeekAction } from "../actions";
import { parseDietPrefs, recipeViolations } from "@/lib/food/diet";
import { cn } from "@/lib/utils";

export const metadata = { title: "Meal plan" };
const SLOTS = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ week?: string; view?: string; month?: string }> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const [profiles, recipes] = await Promise.all([
    prisma.householdProfile.findMany({ select: { id: true, name: true, color: true }, orderBy: { createdAt: "asc" } }),
    prisma.recipe.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  if (sp.view === "month") {
    const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : monthOf(today());
    const { start, end } = monthRange(month);
    const gridStart = startOfWeek(start);
    const items = await getMealItems(gridStart, addDays(gridStart, 41));
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <LinkButton href={`/food/plan?view=month&month=${addMonthsToMonth(month, -1)}`} size="iconSm" variant="ghost" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></LinkButton>
          <h2 className="min-w-36 text-center text-lg font-semibold">{formatMonth(month)}</h2>
          <LinkButton href={`/food/plan?view=month&month=${addMonthsToMonth(month, 1)}`} size="iconSm" variant="ghost" aria-label="Next month"><ChevronRight className="h-4 w-4" /></LinkButton>
          <LinkButton href="/food/plan" size="sm" className="ml-auto">Week view</LinkButton>
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="bg-surface px-2 py-1.5 text-xs font-semibold text-faint">{d}</div>)}
          {dateRange(gridStart, addDays(gridStart, 41)).map((d) => (
            <Link key={d} href={`/food/plan?week=${d}`} className={cn("min-h-24 bg-surface p-1.5 hover:bg-surface-2", (d < start || d > end) && "opacity-40")}>
              <p className={cn("mb-1 text-xs", d === today() ? "font-semibold text-accent" : "text-muted")}>{Number(d.slice(8))}</p>
              {items.filter((i) => i.date === d).map((i) => <p key={i.id} className="truncate text-[11.5px] text-ink/80"><span className="text-faint">{i.slot[0]}</span> {i.title}</p>)}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const weekStart = startOfWeek(sp.week && isDateString(sp.week) ? sp.week : today());
  const days = dateRange(weekStart, addDays(weekStart, 6));
  const items = await getMealItems(weekStart, addDays(weekStart, 6));
  const diets = (await prisma.householdProfile.findMany({ select: { id: true, name: true, dietPreferences: true } })).map((p) => ({ ...p, prefs: parseDietPrefs(p.dietPreferences) }));
  const dietWarnings = (m: (typeof items)[number]) => m.recipe ? diets.filter((d) => m.servings.some((s) => s.profileId === d.id && s.servings > 0)).flatMap((d) => { const v = recipeViolations(m.recipe!.ingredients, d.prefs); return v.length ? [`${d.name}: ${v[0].reason.toLowerCase()} (${v[0].ingredient})`] : []; }) : [];
  const targets = Object.fromEntries(await Promise.all(profiles.map(async (p) => [p.id, (await currentTargets(p.id, weekStart))?.kcal ?? null] as const)));
  const reqs = await computeRequirements(weekStart < today() ? today() : weekStart, addDays(weekStart, 6));
  let est = 0; let unpriced = 0;
  for (const r of reqs) {
    if (!r.toBuy) continue;
    const e = await estimatePrice(r.food, r.toBuy, r.unit);
    if (e) est += e.cents; else unpriced++;
  }
  const toBuy = reqs.filter((r) => r.toBuy === null || r.toBuy > 0).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <LinkButton href={`/food/plan?week=${addDays(weekStart, -7)}`} size="iconSm" variant="ghost" aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></LinkButton>
        <h2 className="min-w-52 text-center text-lg font-semibold">{formatDate(weekStart)} – {formatDate(addDays(weekStart, 6), { year: true })}</h2>
        <LinkButton href={`/food/plan?week=${addDays(weekStart, 7)}`} size="iconSm" variant="ghost" aria-label="Next week"><ChevronRight className="h-4 w-4" /></LinkButton>
        <LinkButton href="/food/plan" size="sm" variant="ghost">This week</LinkButton>
        <LinkButton href="/food/plan?view=month" size="sm" variant="ghost">Month</LinkButton>
        <div className="ml-auto flex flex-wrap gap-2">
          <InlineAction action={copyWeekAction} fields={{ from: addDays(weekStart, -7), to: weekStart }} variant="ghost" size="md" confirm="Copy last week's meals into this week?"><Copy className="h-4 w-4" />Copy last week</InlineAction>
          <PlanAssistant />
          <AddMealDialog recipes={recipes} profiles={profiles} date={days.includes(today()) ? today() : weekStart} variant="primary" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs text-muted">Meals planned</p><p className="text-xl font-semibold tabular">{items.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">Ingredients to buy</p><p className="text-xl font-semibold tabular">{toBuy}</p><Link href="/food/grocery" className="text-xs text-info hover:underline">Shopping list →</Link></Card>
        <Card className="p-4"><p className="text-xs text-muted">Estimated grocery cost</p><p className="text-xl font-semibold tabular">{formatCents(est, viewer.currency)}</p><p className="text-xs text-faint">{unpriced ? `${unpriced} item(s) without recorded price` : "from recorded prices"}</p></Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        {days.map((d) => {
          const dayItems = items.filter((i) => i.date === d);
          return (
            <Card key={d} className={cn("flex flex-col", d === today() && "border-accent/40")}>
              <div className="flex items-center justify-between px-3 pt-3">
                <p className={cn("text-sm font-semibold", d === today() && "text-accent")}>{weekdayName(weekday(d))} <span className="font-normal text-muted">{Number(d.slice(8))}</span></p>
                <AddMealDialog recipes={recipes} profiles={profiles} date={d} iconOnly variant="ghost" />
              </div>
              <div className="flex-1 space-y-2.5 p-3">
                {SLOTS.map((slot) => {
                  const list = dayItems.filter((i) => i.slot === slot);
                  if (!list.length) return null;
                  return (
                    <div key={slot}>
                      <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-faint">{slot.toLowerCase()}</p>
                      <div className="space-y-1.5">
                        {list.map((m) => (
                          <MealCard key={m.id} meal={{
                            id: m.id, title: m.title, slot: m.slot, date: m.date, status: m.status, recipeId: m.recipeId, isLeftover: m.isLeftover, cookTime: m.cookTime, prepNote: m.prepNote,
                            kcalPerServing: m.nutrition?.complete ? m.nutrition.perServing.kcal : null, verified: Boolean(m.nutrition?.verified), dietWarnings: dietWarnings(m),
                            servings: m.servings.map((s) => ({ profileId: s.profileId, name: s.profile.name, color: s.profile.color, servings: s.servings, targetKcal: targets[s.profileId] })),
                          }} />
                        ))}
                      </div>
                    </div>
                  );
                })}
                {!dayItems.length ? <p className="py-3 text-center text-xs text-faint">Nothing planned</p> : null}
              </div>
              <div className="space-y-0.5 border-t border-line px-3 py-2">
                {profiles.map((p) => {
                  const planned = dayItems.reduce((a, m) => a + (m.nutrition?.complete ? m.nutrition.perServing.kcal * (m.servings.find((s) => s.profileId === p.id)?.servings ?? 0) : 0), 0);
                  return <p key={p.id} className="flex justify-between text-[11px] text-faint"><span>{p.name}</span><span className="tabular">{Math.round(planned)}{targets[p.id] ? ` / ${targets[p.id]}` : ""} kcal</span></p>;
                })}
              </div>
            </Card>
          );
        })}
      </div>
      <Card>
        <CardHeader title="How portions work" />
        <CardBody className="text-sm text-muted">
          Each person&apos;s servings default to their own calorie target × the meal&apos;s share of the day (breakfast 25 %, lunch 30 %, dinner 35 %, snack 10 %) ÷ kcal per serving, rounded to ¼ serving. Edit any number to override — the shopping list recalculates automatically. <Badge>~</Badge> marks estimated nutrition.
        </CardBody>
      </Card>
    </div>
  );
}
