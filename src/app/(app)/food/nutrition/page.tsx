import Link from "next/link";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { requireViewer } from "@/lib/auth/session";
import { dayLog, nutritionTrend } from "@/lib/food/foodlog";
import { getMealItems } from "@/lib/food/mealplan";
import { addDays, today, formatDate, isDateString } from "@/lib/dates";
import { Card, CardHeader, CardBody, Badge, Progress, LinkButton } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { TrendLine } from "@/components/charts";
import { LogFoodDialog } from "@/components/food/log-food";
import { logPlannedAction, deleteLogItemAction } from "../actions";

export const metadata = { title: "Nutrition" };

export default async function NutritionPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const d = sp.date && isDateString(sp.date) ? sp.date : today();
  const [log, trend, meals] = await Promise.all([dayLog(viewer, viewer.profileId, d), nutritionTrend(viewer, viewer.profileId, d, 14), getMealItems(d, d)]);
  const toLog = meals.filter((m) => m.servings.some((s) => s.profileId === viewer.profileId && !s.logged) && m.status !== "SKIPPED");
  const t = log.target;
  const macro = (label: string, v: number, target: number | undefined, unit: string) => (
    <div key={label}>
      <div className="flex justify-between text-sm"><span className="text-muted">{label}</span><span className="tabular">{v}{target ? ` / ${target}` : ""} {unit}</span></div>
      {target ? <Progress value={v} max={target} tone={v > target * 1.1 ? "warn" : "accent"} className="mt-1.5" /> : null}
    </div>
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <LinkButton href={`/food/nutrition?date=${addDays(d, -1)}`} size="iconSm" variant="ghost" aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></LinkButton>
        <h2 className="min-w-44 text-center text-lg font-semibold">{formatDate(d, { weekday: true })}</h2>
        <LinkButton href={`/food/nutrition?date=${addDays(d, 1)}`} size="iconSm" variant="ghost" aria-label="Next day"><ChevronRight className="h-4 w-4" /></LinkButton>
        <Badge className="ml-2">Private to {viewer.name}</Badge>
        <div className="ml-auto"><LogFoodDialog date={d} /></div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {toLog.length ? (
            <Card>
              <CardHeader title="Planned for you" sub="Log your portion with one tap" />
              <CardBody className="space-y-2">
                {toLog.map((m) => {
                  const s = m.servings.find((x) => x.profileId === viewer.profileId)!;
                  return (
                    <div key={m.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-2.5">
                      <span className="w-20 text-xs uppercase tracking-wider text-faint">{m.slot.toLowerCase()}</span>
                      <span className="flex-1">{m.title} <span className="text-muted">× {s.servings}</span></span>
                      <span className="text-sm tabular text-muted">{m.nutrition?.complete ? `${Math.round(m.nutrition.perServing.kcal * s.servings)} kcal` : "nutrition incomplete"}</span>
                      <InlineAction action={logPlannedAction} fields={{ mealId: m.id }} variant="outline">Log</InlineAction>
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Food log" sub={log.hasEstimates ? "Entries marked “est.” use estimated or unverified values" : undefined} />
            {log.items.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {log.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <span className="w-20 text-xs uppercase tracking-wider text-faint">{i.slot.toLowerCase()}</span>
                    <span className="min-w-0 flex-1">{i.description} {i.isEstimate ? <Badge>est.</Badge> : <Badge tone="accent">{i.source === "LABEL" ? "label" : "reference"}</Badge>}</span>
                    <span className="hidden tabular text-faint sm:inline">P {i.protein} · C {i.carbs} · F {i.fat}</span>
                    <span className="w-20 text-right tabular font-medium">{Math.round(i.kcal)} kcal</span>
                    <InlineAction action={deleteLogItemAction} fields={{ id: i.id }} variant="ghost" size="iconSm" title="Remove"><Trash2 className="h-4 w-4" /></InlineAction>
                  </li>
                ))}
              </ul>
            ) : <CardBody><p className="text-sm text-muted">Nothing logged for this day.</p></CardBody>}
          </Card>
          <Card>
            <CardHeader title="Last 14 days" sub="Logged calories; dashed line is your current target" />
            <CardBody>
              {trend.some((x) => x.logged) ? <TrendLine data={trend.map((x) => ({ date: x.date, kcal: x.logged ? x.kcal : null }))} x="date" xFmt="date" series={[{ key: "kcal", name: "Calories" }]} fmt="kcal" reference={t?.kcal} referenceLabel="target" /> : <p className="text-sm text-muted">No logs yet — trends appear once you log food.</p>}
            </CardBody>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Daily totals" action={<LinkButton href="/people#targets" size="sm" variant="ghost">Targets</LinkButton>} />
          <CardBody className="space-y-3.5">
            {macro("Energy", log.totals.kcal, t?.kcal, "kcal")}
            {macro("Protein", log.totals.protein, t?.protein, "g")}
            {macro("Carbs", log.totals.carbs, t?.carbs, "g")}
            {macro("Fat", log.totals.fat, t?.fat, "g")}
            {macro("Fibre", log.totals.fibre, t?.fibre, "g")}
            {!t ? <p className="text-sm text-muted">No targets set. <Link href="/people#targets" className="text-info underline">Set targets</Link> to compare and to size meal portions.</p> : <p className="text-xs text-faint">Target method: {t.method === "MIFFLIN_ST_JEOR" ? "Mifflin–St Jeor estimate" : "manual"}, from {formatDate(t.effectiveFrom)}.</p>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
