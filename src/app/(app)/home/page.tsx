import { Circle, CheckCircle2, SkipForward, Archive, Repeat, ListChecks } from "lucide-react";
import { prisma } from "@/lib/db";
import { listTasks } from "@/lib/home/tasks";
import { describeSchedule } from "@/lib/recurrence";
import { today, relativeDay, addDays } from "@/lib/dates";
import { Card, CardHeader, Badge, Empty } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { NewTaskDialog } from "@/components/home/forms";
import { completeTaskAction, deleteTaskAction, reopenTaskAction } from "./actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Home" };
const CATS = ["CLEANING", "KITCHEN", "LAUNDRY", "GARDENING", "MAINTENANCE", "ERRAND", "OTHER"];

export default async function HomeTasksPage({ searchParams }: { searchParams: Promise<{ category?: string; done?: string }> }) {
  const sp = await searchParams;
  const [tasks, profiles] = await Promise.all([listTasks({ category: sp.category, includeDone: sp.done === "1" }), prisma.householdProfile.findMany({ select: { id: true, name: true } })]);
  const d = today();
  const groups = [
    { key: "overdue", label: "Overdue", items: tasks.filter((t) => t.status === "OPEN" && t.dueDate && t.dueDate < d) },
    { key: "today", label: "Today", items: tasks.filter((t) => t.status === "OPEN" && t.dueDate === d) },
    { key: "week", label: "Next 7 days", items: tasks.filter((t) => t.status === "OPEN" && t.dueDate && t.dueDate > d && t.dueDate <= addDays(d, 7)) },
    { key: "later", label: "Later & unscheduled", items: tasks.filter((t) => t.status === "OPEN" && (!t.dueDate || t.dueDate > addDays(d, 7))) },
    { key: "done", label: "Done", items: tasks.filter((t) => t.status === "DONE") },
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <a href="/home" className={cn("rounded-lg px-3 py-1.5 text-sm", !sp.category ? "bg-surface-3 text-ink" : "text-muted")}>All</a>
        {CATS.map((c) => <a key={c} href={`/home?category=${c}`} className={cn("rounded-lg px-3 py-1.5 text-sm", sp.category === c ? "bg-surface-3 text-ink" : "text-muted hover:text-ink")}>{c[0] + c.slice(1).toLowerCase()}</a>)}
        <a href={`/home?${new URLSearchParams({ ...(sp.category ? { category: sp.category } : {}), ...(sp.done === "1" ? {} : { done: "1" }) })}`} className="text-sm text-faint hover:text-ink">{sp.done === "1" ? "Hide done" : "Show done"}</a>
        <div className="ml-auto"><NewTaskDialog profiles={profiles} defaultCategory={sp.category ?? "CLEANING"} /></div>
      </div>
      {tasks.length ? groups.filter((g) => g.items.length).map((g) => (
        <Card key={g.key}>
          <CardHeader title={g.label} sub={`${g.items.length} task(s)`} />
          <ul className="divide-y divide-line border-t border-line">
            {g.items.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                {t.status === "OPEN" ? <InlineAction action={completeTaskAction} fields={{ id: t.id }} variant="ghost" size="iconSm" title="Done"><Circle className="h-5 w-5" /></InlineAction> : <InlineAction action={reopenTaskAction} fields={{ id: t.id }} variant="ghost" size="iconSm" title="Reopen"><CheckCircle2 className="h-5 w-5 text-accent" /></InlineAction>}
                <div className="min-w-48 flex-1">
                  <p className="font-medium">{t.title} {t.isDeepClean ? <Badge tone="info">deep clean</Badge> : null}</p>
                  <p className="text-xs text-faint">
                    {t.category.toLowerCase()}{t.area ? ` · ${t.area}` : ""}{t.schedule ? ` · ${describeSchedule(t.schedule)}` : ""}{t.assigneeProfileId ? ` · ${profiles.find((p) => p.id === t.assigneeProfileId)?.name}` : ""}
                    {t.completions[0] ? ` · last done ${relativeDay(t.completions[0].completedAt.toISOString().slice(0, 10)).toLowerCase()}` : ""}
                  </p>
                  {t.description ? <p className="mt-1 text-sm text-muted">{t.description}</p> : null}
                </div>
                {t.dueDate ? <span className={cn("text-sm", t.dueDate < d && t.status === "OPEN" ? "text-danger" : "text-muted")}>{relativeDay(t.dueDate)}{t.dueTime ? ` ${t.dueTime}` : ""}</span> : null}
                {t.schedule && t.status === "OPEN" ? <InlineAction action={completeTaskAction} fields={{ id: t.id, skip: 1 }} variant="ghost" size="iconSm" title="Skip this occurrence"><SkipForward className="h-4 w-4" /></InlineAction> : null}
                {t.schedule ? <Repeat className="h-4 w-4 text-faint" aria-label="Recurring" /> : null}
                <InlineAction action={deleteTaskAction} fields={{ id: t.id }} variant="ghost" size="iconSm" confirm="Archive this task?" title="Archive"><Archive className="h-4 w-4" /></InlineAction>
              </li>
            ))}
          </ul>
        </Card>
      )) : <Empty icon={<ListChecks className="h-7 w-7" />} title="No tasks yet">Add recurring cleaning, laundry, watering or maintenance tasks — they appear on Today and the calendar.</Empty>}
    </div>
  );
}
