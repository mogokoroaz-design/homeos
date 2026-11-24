import Link from "next/link";
import { ChevronLeft, ChevronRight, Check, SkipForward, Trash2, Lock, Repeat, RotateCcw } from "lucide-react";
import { requireViewer } from "@/lib/auth/session";
import { calendarItems, type CalKind } from "@/lib/calendar";
import { today, addDays, startOfWeek, dateRange, monthOf, monthRange, addMonthsToMonth, formatMonth, formatDate, isDateString, weekday, weekdayName } from "@/lib/dates";
import { Card, CardHeader, Badge, LinkButton } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { EventDialog, ReminderDialog } from "@/components/calendar/forms";
import { occurrenceAction, deleteEventAction, toggleReminderAction } from "./actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Calendar" };

const KIND_STYLE: Record<CalKind, string> = {
  event: "bg-[#3987e5]", meal: "bg-[#199e70]", prep: "bg-[#0ca30c]", task: "bg-[#c98500]", bill: "bg-[#e66767]", visit: "bg-[#d95926]",
  workout: "bg-[#9085e9]", project: "bg-[#d55181]", routine: "bg-[#9085e9]", reminder: "bg-[#9098a5]", maintenance: "bg-[#d95926]",
};
const KINDS: CalKind[] = ["event", "meal", "prep", "task", "bill", "visit", "maintenance", "workout", "routine", "project", "reminder"];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; date?: string; hide?: string }> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const selected = sp.date && isDateString(sp.date) ? sp.date : today();
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : monthOf(selected);
  const hidden = new Set((sp.hide ?? "").split(",").filter(Boolean));
  const { start, end } = monthRange(month);
  const gridStart = startOfWeek(start);
  const gridEnd = addDays(gridStart, 41);
  const all = (await calendarItems(viewer, gridStart, gridEnd)).filter((i) => !hidden.has(i.kind));
  const day = all.filter((i) => i.date === selected);
  const qs = (o: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ month, date: selected, hide: sp.hide, ...o }).filter(([, v]) => v) as [string, string][]).toString();
  const toggleKind = (k: string) => { const s = new Set(hidden); if (s.has(k)) s.delete(k); else s.add(k); return [...s].join(","); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-[26px] font-semibold tracking-tight">Calendar</h1>
        <LinkButton href={qs({ month: addMonthsToMonth(month, -1) })} size="iconSm" variant="ghost" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></LinkButton>
        <span className="min-w-28 text-center font-semibold">{formatMonth(month)}</span>
        <LinkButton href={qs({ month: addMonthsToMonth(month, 1) })} size="iconSm" variant="ghost" aria-label="Next month"><ChevronRight className="h-4 w-4" /></LinkButton>
        <LinkButton href="/calendar" size="sm" variant="ghost">Today</LinkButton>
        <div className="ml-auto flex gap-2"><ReminderDialog date={selected} /><EventDialog date={selected} /></div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => <Link key={k} href={qs({ hide: toggleKind(k) || undefined })} className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", hidden.has(k) ? "border-line text-faint line-through" : "border-line-strong text-muted")}><span className={cn("h-2 w-2 rounded-full", KIND_STYLE[k])} />{k}</Link>)}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="grid grid-cols-7 bg-surface">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-2 py-2 text-xs font-semibold text-faint">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-px bg-line">
            {dateRange(gridStart, gridEnd).map((d) => {
              const items = all.filter((i) => i.date === d);
              return (
                <Link key={d} href={qs({ date: d })} className={cn("min-h-24 bg-bg p-1.5 hover:bg-surface sm:min-h-28", (d < start || d > end) && "opacity-40", d === selected && "bg-surface-2")}>
                  <p className={cn("mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs", d === today() ? "bg-accent font-semibold text-[#0c1110]" : "text-muted")}>{Number(d.slice(8))}</p>
                  <div className="space-y-0.5">
                    {items.slice(0, 4).map((i) => <p key={i.id} className={cn("flex items-center gap-1 truncate text-[11px]", i.done || i.skipped ? "text-faint line-through" : "text-ink/85")}><span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", KIND_STYLE[i.kind])} />{i.time ? `${i.time} ` : ""}{i.title}</p>)}
                    {items.length > 4 ? <p className="text-[10.5px] text-faint">+{items.length - 4} more</p> : null}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
        <Card className="h-fit">
          <CardHeader title={formatDate(selected, { weekday: true, year: true })} sub={`${day.length} item(s) · ${weekdayName(weekday(selected), false)}`} />
          <ul className="divide-y divide-line border-t border-line">
            {day.map((i) => (
              <li key={i.id} className={cn("flex items-start gap-3 px-4 py-3", (i.done || i.skipped) && "opacity-60")}>
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", KIND_STYLE[i.kind])} />
                <div className="min-w-0 flex-1">
                  <Link href={i.href} className={cn("text-sm font-medium hover:underline", i.skipped && "line-through")}>{i.title}</Link>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-faint">{i.time ? <span>{i.time}</span> : null}<span>{i.kind}</span>{i.sub ? <span>· {i.sub}</span> : null}{i.isPrivate ? <Lock className="h-3 w-3" /> : null}{i.recurring ? <Repeat className="h-3 w-3" /> : null}{i.done ? <Badge tone="accent">done</Badge> : null}{i.skipped ? <Badge>skipped</Badge> : null}</p>
                </div>
                {i.eventId ? (
                  <div className="flex shrink-0">
                    {i.done || i.skipped ? <InlineAction action={occurrenceAction} fields={{ eventId: i.eventId, date: i.date, status: "CLEAR" }} variant="ghost" size="iconSm" title="Undo"><RotateCcw className="h-3.5 w-3.5" /></InlineAction> : <>
                      <InlineAction action={occurrenceAction} fields={{ eventId: i.eventId, date: i.date, status: "DONE" }} variant="ghost" size="iconSm" title="Complete"><Check className="h-3.5 w-3.5" /></InlineAction>
                      <InlineAction action={occurrenceAction} fields={{ eventId: i.eventId, date: i.date, status: "SKIPPED" }} variant="ghost" size="iconSm" title="Skip"><SkipForward className="h-3.5 w-3.5" /></InlineAction>
                      <InlineAction action={occurrenceAction} fields={{ eventId: i.eventId, date: i.date, status: "MOVED", movedTo: addDays(i.date, 1) }} variant="ghost" size="iconSm" title="Move to next day"><ChevronRight className="h-3.5 w-3.5" /></InlineAction>
                    </>}
                    <InlineAction action={deleteEventAction} fields={{ eventId: i.eventId }} variant="ghost" size="iconSm" confirm={i.recurring ? "Delete this event and all its repeats?" : "Delete this event?"} title="Delete"><Trash2 className="h-3.5 w-3.5" /></InlineAction>
                  </div>
                ) : i.kind === "reminder" ? <InlineAction action={toggleReminderAction} fields={{ id: i.id.replace("rem:", "") }} variant="ghost" size="iconSm" title="Toggle done"><Check className="h-3.5 w-3.5" /></InlineAction> : null}
              </li>
            ))}
            {!day.length ? <li className="px-4 py-6 text-center text-sm text-faint">Nothing scheduled.</li> : null}
          </ul>
          <p className="border-t border-line px-4 py-2.5 text-[11px] text-faint">Meals, tasks, bills, visits and routines are managed in their own sections; this view brings them together. Private items are shown only to you.</p>
        </Card>
      </div>
    </div>
  );
}
