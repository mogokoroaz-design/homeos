import Link from "next/link";
import { CheckCircle2, Circle, CookingPot, ListChecks, CalendarClock, ShoppingCart, Receipt, TriangleAlert, Activity, FolderKanban, Pin, Wallet, Repeat, Sparkles } from "lucide-react";
import { requireViewer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { today, addDays, formatDate, relativeDay, monthOf } from "@/lib/dates";
import { getMealItems } from "@/lib/food/mealplan";
import { expiringSoon } from "@/lib/food/pantry";
import { getActiveList } from "@/lib/food/grocery";
import { billOccurrences } from "@/lib/finance/bills";
import { monthSummary } from "@/lib/finance/ledger";
import { calendarItems } from "@/lib/calendar";
import { habitsWithStatus, routinesForDay, latestMetrics } from "@/lib/personal/wellness";
import { dayLog } from "@/lib/food/foodlog";
import { listOwnProjects } from "@/lib/projects/projects";
import { listNotes } from "@/lib/notes";
import { Card, CardHeader, CardBody, Badge, Progress, LinkButton, Empty } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { completeTaskAction } from "../home/actions";
import { toggleHabitAction, toggleRoutineAction } from "../people/actions";
import { logPlannedAction } from "../food/actions";
import { formatCents } from "@/lib/money";
import { formatQuantity } from "@/lib/units";
import { safeJson, cn } from "@/lib/utils";
import { TodayAsk } from "./today-ask";

export const metadata = { title: "Today" };

const WIDGETS = ["meals", "tasks", "routines", "agenda", "grocery", "bills", "expiring", "wellness", "projects", "notes", "spending"] as const;

export default async function TodayPage() {
  const viewer = await requireViewer();
  const d = today();
  const profile = await prisma.householdProfile.findUniqueOrThrow({ where: { id: viewer.profileId } });
  const hidden = new Set(safeJson<{ hidden?: string[] }>(profile.dashboardConfig, {}).hidden ?? []);
  const show = (w: (typeof WIDGETS)[number]) => !hidden.has(w);

  const [meals, tasks, agenda, list, bills, expiring, month, habits, routines, metrics, log, projects, notes] = await Promise.all([
    getMealItems(d, d),
    prisma.householdTask.findMany({ where: { active: true, status: "OPEN", dueDate: { lte: d } }, orderBy: [{ dueDate: "asc" }], take: 12 }),
    calendarItems(viewer, d, addDays(d, 7)),
    getActiveList(),
    billOccurrences(addDays(d, -60), addDays(d, 7)),
    expiringSoon(3),
    monthSummary(monthOf(d)),
    habitsWithStatus(viewer, viewer.profileId, d),
    routinesForDay(viewer, viewer.profileId, d),
    latestMetrics(viewer, viewer.profileId),
    dayLog(viewer, viewer.profileId, d),
    listOwnProjects(viewer),
    listNotes(viewer, {}),
  ]);
  const groceryItems = await prisma.groceryItem.findMany({ where: { listId: list.id, checked: false } });
  const unpaid = bills.filter((b) => b.status !== "PAID" && !b.projected);
  const upcoming = agenda.filter((i) => ["event", "visit", "bill", "maintenance", "reminder"].includes(i.kind) && !i.skipped && (i.date > d || i.kind !== "bill")).slice(0, 8);
  const profiles = await prisma.householdProfile.findMany({ select: { id: true, name: true } });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{formatDate(d, { weekday: true, year: true })}</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight">{greeting}, {viewer.name}</h1>
        </div>
        <TodayAsk />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {show("meals") && (
          <Card className="lg:col-span-2">
            <CardHeader icon={<CookingPot className="h-4 w-4 text-accent" />} title="Today's meals" action={<LinkButton href="/food/plan" size="sm" variant="ghost">Plan</LinkButton>} />
            <CardBody className="space-y-2">
              {meals.length ? meals.map((m) => {
                const mine = m.servings.find((s) => s.profileId === viewer.profileId);
                return (
                  <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
                    <span className="w-20 text-xs font-semibold uppercase tracking-wider text-faint">{m.slot.toLowerCase()}</span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("font-medium", m.status === "SKIPPED" && "text-faint line-through")}>{m.recipeId ? <Link href={`/food/recipes/${m.recipeId}`} className="hover:underline">{m.title}</Link> : m.title}</p>
                      <p className="text-xs text-muted">{m.servings.map((s) => `${s.profile.name} ${s.servings}×`).join(" · ")}{m.cookTime ? ` · cook ${m.cookTime}` : ""}{m.nutrition && mine ? ` · your portion ≈ ${Math.round(m.nutrition.perServing.kcal * mine.servings)} kcal${m.nutrition.verified ? "" : " (est.)"}` : ""}</p>
                    </div>
                    {m.status === "COOKED" ? <Badge tone="accent">cooked</Badge> : null}
                    {mine && !mine.logged ? <InlineAction action={logPlannedAction} fields={{ mealId: m.id }} variant="outline">Log my portion</InlineAction> : mine?.logged ? <Badge tone="accent">logged</Badge> : null}
                  </div>
                );
              }) : <Empty title="No meals planned today"><Link className="text-info underline" href="/food/plan">Plan meals</Link> or ask the kitchen assistant what you can cook.</Empty>}
            </CardBody>
          </Card>
        )}

        {show("wellness") && (
          <Card>
            <CardHeader icon={<Activity className="h-4 w-4 text-accent" />} title="My day" sub="Private to you" action={<LinkButton href="/people" size="sm" variant="ghost">Open</LinkButton>} />
            <CardBody className="space-y-4">
              <div>
                <div className="flex items-baseline justify-between text-sm"><span className="text-muted">Calories</span><span className="tabular font-medium">{log.totals.kcal}{log.target ? ` / ${log.target.kcal}` : ""} kcal</span></div>
                {log.target ? <Progress value={log.totals.kcal} max={log.target.kcal} tone={log.totals.kcal > log.target.kcal * 1.05 ? "warn" : "accent"} className="mt-1.5" /> : <p className="mt-1 text-xs text-faint">No target set yet.</p>}
                {log.target ? <p className="mt-1.5 text-xs text-muted tabular">P {log.totals.protein}/{log.target.protein} g · C {log.totals.carbs}/{log.target.carbs} g · F {log.totals.fat}/{log.target.fat} g</p> : null}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {(["WEIGHT", "STEPS", "SLEEP_HOURS"] as const).map((t) => (
                  <div key={t} className="rounded-xl bg-surface-2 px-2 py-2.5">
                    <p className="text-[11px] text-faint">{t === "WEIGHT" ? "Weight" : t === "STEPS" ? "Steps" : "Sleep"}</p>
                    <p className="tabular font-semibold">{metrics[t] ? `${metrics[t]!.value}${t === "WEIGHT" ? " kg" : t === "SLEEP_HOURS" ? " h" : ""}` : "—"}</p>
                    <p className="text-[10.5px] text-faint">{metrics[t] ? relativeDay(metrics[t]!.date) : "not logged"}</p>
                  </div>
                ))}
              </div>
              {habits.length ? (
                <div className="space-y-1.5">
                  {habits.map((h) => (
                    <InlineAction key={h.id} action={toggleHabitAction} fields={{ id: h.id, date: d }} variant="ghost" className="h-10 w-full justify-start px-2">
                      {h.doneToday ? <CheckCircle2 className="h-5 w-5 text-accent" /> : <Circle className="h-5 w-5 text-faint" />}
                      <span className={cn("flex-1 text-left", h.doneToday ? "text-ink" : "text-muted")}>{h.name}</span>
                      <span className="text-xs text-faint">{h.weekCount}/{h.targetPerWeek} this week</span>
                    </InlineAction>
                  ))}
                </div>
              ) : null}
            </CardBody>
          </Card>
        )}

        {show("tasks") && (
          <Card>
            <CardHeader icon={<ListChecks className="h-4 w-4 text-accent" />} title="Household tasks" sub={tasks.length ? `${tasks.length} due` : undefined} action={<LinkButton href="/home" size="sm" variant="ghost">All</LinkButton>} />
            <CardBody className="space-y-1">
              {tasks.length ? tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2">
                  <InlineAction action={completeTaskAction} fields={{ id: t.id }} variant="ghost" size="iconSm" title="Mark done"><Circle className="h-5 w-5" /></InlineAction>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{t.title}</p>
                    <p className="text-xs text-faint">{t.category.toLowerCase()}{t.area ? ` · ${t.area}` : ""}{t.dueDate && t.dueDate < d ? ` · overdue ${relativeDay(t.dueDate).toLowerCase()}` : ""}{t.assigneeProfileId ? ` · ${profiles.find((p) => p.id === t.assigneeProfileId)?.name}` : ""}</p>
                  </div>
                </div>
              )) : <p className="py-2 text-sm text-muted">Nothing due. </p>}
            </CardBody>
          </Card>
        )}

        {show("routines") && (
          <Card>
            <CardHeader icon={<Repeat className="h-4 w-4 text-accent" />} title="My routines" sub="Private" action={<LinkButton href="/people#routines" size="sm" variant="ghost">Edit</LinkButton>} />
            <CardBody className="space-y-2">
              {routines.length ? routines.map((r) => (
                <div key={r.id} className="rounded-xl bg-surface-2 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <InlineAction action={toggleRoutineAction} fields={{ id: r.id, date: d }} variant="ghost" size="iconSm" title={r.done ? "Mark not done" : "Mark done"}>{r.done ? <CheckCircle2 className="h-5 w-5 text-accent" /> : <Circle className="h-5 w-5" />}</InlineAction>
                    <p className="flex-1 text-sm font-medium">{r.name}</p>
                    <span className="text-xs text-faint">{r.time ?? r.timeOfDay.toLowerCase()}</span>
                  </div>
                  {r.stepsList.length ? <p className="ml-11 text-xs text-muted">{r.stepsList.join(" → ")}</p> : null}
                </div>
              )) : <p className="py-2 text-sm text-muted">No routines for today.</p>}
            </CardBody>
          </Card>
        )}

        {show("agenda") && (
          <Card>
            <CardHeader icon={<CalendarClock className="h-4 w-4 text-accent" />} title="Coming up" action={<LinkButton href="/calendar" size="sm" variant="ghost">Calendar</LinkButton>} />
            <CardBody className="space-y-2">
              {upcoming.length ? upcoming.map((i) => (
                <Link key={i.id} href={i.href} className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-surface-2">
                  <span className="w-20 shrink-0 text-xs text-muted">{relativeDay(i.date)}{i.time ? ` ${i.time}` : ""}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{i.title}</span>
                  <Badge>{i.kind}</Badge>
                </Link>
              )) : <p className="py-2 text-sm text-muted">Nothing in the next 7 days.</p>}
            </CardBody>
          </Card>
        )}

        {show("grocery") && (
          <Card>
            <CardHeader icon={<ShoppingCart className="h-4 w-4 text-accent" />} title="Groceries" action={<LinkButton href="/food/grocery" size="sm" variant="ghost">List</LinkButton>} />
            <CardBody>
              {groceryItems.length ? (
                <>
                  <p className="text-sm"><span className="text-lg font-semibold tabular">{groceryItems.length}</span> item(s) to buy{groceryItems.some((g) => g.estimatedPriceCents) ? <> · ≈ <span className="tabular">{formatCents(groceryItems.reduce((a, g) => a + (g.estimatedPriceCents ?? 0), 0), viewer.currency)}</span></> : null}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{groceryItems.slice(0, 8).map((g) => g.name).join(", ")}</p>
                </>
              ) : <p className="text-sm text-muted">Shopping list is empty.</p>}
            </CardBody>
          </Card>
        )}

        {show("bills") && (
          <Card>
            <CardHeader icon={<Receipt className="h-4 w-4 text-accent" />} title="Bills" action={<LinkButton href="/money/bills" size="sm" variant="ghost">Bills</LinkButton>} />
            <CardBody className="space-y-2">
              {unpaid.length ? unpaid.map((b) => (
                <div key={`${b.billId}${b.date}`} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{b.name}</span>
                  <span className={cn("shrink-0 tabular", b.date < d ? "text-danger" : "text-muted")}>{formatCents(b.amountCents, viewer.currency)} · {relativeDay(b.date)}</span>
                </div>
              )) : <p className="text-sm text-muted">No bills due this week.</p>}
            </CardBody>
          </Card>
        )}

        {show("expiring") && (
          <Card>
            <CardHeader icon={<TriangleAlert className="h-4 w-4 text-warn" />} title="Use soon" action={<LinkButton href="/food/pantry" size="sm" variant="ghost">Pantry</LinkButton>} />
            <CardBody className="space-y-1.5">
              {expiring.length ? expiring.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{p.name} <span className="text-faint">{formatQuantity(p.quantity, p.unit)}</span></span>
                  <span className={cn("shrink-0 text-xs", p.expiryDate! < d ? "text-danger" : "text-warn")}>{relativeDay(p.expiryDate!)}</span>
                </div>
              )) : <p className="text-sm text-muted">Nothing expiring in the next 3 days.</p>}
            </CardBody>
          </Card>
        )}

        {show("spending") && (
          <Card>
            <CardHeader icon={<Wallet className="h-4 w-4 text-accent" />} title="Spending this month" action={<LinkButton href="/money" size="sm" variant="ghost">Money</LinkButton>} />
            <CardBody>
              <p className="text-2xl font-semibold tabular">{formatCents(month.total, viewer.currency)}</p>
              {month.budgetTotal ? <><Progress value={month.total} max={month.budgetTotal} tone={month.total > month.budgetTotal ? "danger" : "accent"} className="mt-2" /><p className="mt-1.5 text-xs text-muted">of {formatCents(month.budgetTotal, viewer.currency)} budgeted</p></> : <p className="mt-1 text-xs text-faint">No budgets set for this month.</p>}
            </CardBody>
          </Card>
        )}

        {show("projects") && (
          <Card>
            <CardHeader icon={<FolderKanban className="h-4 w-4 text-accent" />} title="My projects" sub="Private" action={<LinkButton href="/projects" size="sm" variant="ghost">All</LinkButton>} />
            <CardBody className="space-y-1.5">
              {projects.length ? projects.slice(0, 5).map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center justify-between gap-2 rounded-lg px-1 py-1 text-sm hover:bg-surface-2">
                  <span className="truncate">{p.name}</span>
                  <span className={cn("shrink-0 text-xs", p.entries[0]?.date === d ? "text-accent" : "text-faint")}>{p.entries[0] ? (p.entries[0].date === d ? "logged today" : `last ${relativeDay(p.entries[0].date).toLowerCase()}`) : "no entries"}</span>
                </Link>
              )) : <p className="text-sm text-muted">No projects yet.</p>}
            </CardBody>
          </Card>
        )}

        {show("notes") && (
          <Card>
            <CardHeader icon={<Pin className="h-4 w-4 text-accent" />} title="Pinned notes" action={<LinkButton href="/notes" size="sm" variant="ghost">Notes</LinkButton>} />
            <CardBody className="space-y-2">
              {notes.filter((n) => n.pinned).slice(0, 4).map((n) => (
                <div key={n.id} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  <p className="font-medium">{n.title || n.body.slice(0, 40)}</p>
                  {n.title && n.body ? <p className="line-clamp-2 text-xs text-muted">{n.body}</p> : null}
                </div>
              ))}
              {!notes.some((n) => n.pinned) ? <p className="text-sm text-muted">Pin notes to keep them here.</p> : null}
            </CardBody>
          </Card>
        )}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-faint"><Sparkles className="h-3.5 w-3.5" />Choose which cards appear in Settings → Dashboard.</p>
    </div>
  );
}
