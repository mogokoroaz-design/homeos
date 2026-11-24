import Link from "next/link";
import { Lock, Trash2, CheckCircle2, Circle, Shield } from "lucide-react";
import { requireViewer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { canViewPersonal, ACCESS_SCOPES } from "@/lib/auth/access";
import { listMetrics, latestMetrics, listWorkouts, habitsWithStatus, routinesForDay } from "@/lib/personal/wellness";
import { currentTargets } from "@/lib/food/targets";
import { dayLog } from "@/lib/food/foodlog";
import { addDays, today, ageFrom, formatDate, relativeDay, startOfWeek, dateRange, weekdayName, weekday } from "@/lib/dates";
import { METRIC_TYPES } from "@/lib/validation";
import { Card, CardHeader, CardBody, Badge, SectionTitle } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { TrendLine, Bars } from "@/components/charts";
import { HealthCard, HealthIcon } from "@/components/people/health-card";
import { ProfileForm, TargetsForm, MetricForm, WorkoutDialog, HabitForm, RoutineDialog } from "@/components/people/forms";
import { deleteMetricAction, deleteWorkoutAction, toggleHabitAction, toggleRoutineAction, deletePersonalAction, setAccessAction } from "./actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "People" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ member?: string }> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const profiles = await prisma.householdProfile.findMany({ orderBy: { createdAt: "asc" } });
  const others = profiles.filter((p) => p.id !== viewer.profileId);
  const d = today();

  // Viewing another member: only what they explicitly shared.
  if (sp.member && sp.member !== viewer.profileId) {
    const m = profiles.find((p) => p.id === sp.member);
    if (!m) return <p>Not found.</p>;
    const [canW, canN, canF, canH] = await Promise.all(ACCESS_SCOPES.map((s) => canViewPersonal(viewer, m.id, s)));
    return (
      <div className="space-y-5">
        <h1 className="text-[26px] font-semibold tracking-tight">{m.name}</h1>
        {!canW && !canN && !canF && !canH ? <Card className="flex items-center gap-3 p-6 text-muted"><Lock className="h-5 w-5" />{m.name}&apos;s wellness, nutrition, fitness and habit records are private. They can share specific areas with you from their People page.</Card> : null}
        {canW ? <MemberWeights viewerId={viewer.profileId} ownerId={m.id} /> : null}
        {canN ? <MemberNutrition viewerId={viewer.profileId} ownerId={m.id} /> : null}
        {canF ? <MemberWorkouts viewerId={viewer.profileId} ownerId={m.id} /> : null}
        <Link href="/people" className="text-sm text-info underline">Back to my profile</Link>
      </div>
    );
  }

  const me = profiles.find((p) => p.id === viewer.profileId)!;
  const [weights, steps, sleep, latest, workouts, habits, routines, target, grants] = await Promise.all([
    listMetrics(viewer, me.id, "WEIGHT", 180), listMetrics(viewer, me.id, "STEPS", 14), listMetrics(viewer, me.id, "SLEEP_HOURS", 14), latestMetrics(viewer, me.id),
    listWorkouts(viewer, me.id, 84), habitsWithStatus(viewer, me.id, d), routinesForDay(viewer, me.id, d), currentTargets(me.id), prisma.profileAccess.findMany({ where: { ownerProfileId: me.id } }),
  ]);
  const [lastImportRow, lastSyncRow] = await Promise.all([prisma.appSetting.findUnique({ where: { key: `health.lastImport.${me.id}` } }), prisma.appSetting.findUnique({ where: { key: `health.lastSync.${me.id}` } })]);
  const activeEnergy = await listMetrics(viewer, me.id, "ACTIVE_KCAL", 14);
  const allRoutines = await prisma.personalRoutine.findMany({ where: { profileId: me.id, active: true }, include: { schedule: true } });
  const recentMetrics = await prisma.wellnessMetric.findMany({ where: { profileId: me.id }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 12 });
  const age = ageFrom(me.birthDate);
  const lastWeight = latest.WEIGHT?.value ?? null;
  const bmi = lastWeight && me.heightCm ? lastWeight / (me.heightCm / 100) ** 2 : null;
  const weeks = Array.from({ length: 12 }, (_, i) => { const ws = addDays(startOfWeek(d), -7 * (11 - i)); const w = workouts.filter((x) => x.date >= ws && x.date <= addDays(ws, 6)); return { week: ws, minutes: w.reduce((a, x) => a + x.durationMin, 0) }; });
  const fortnight = dateRange(addDays(d, -13), d);
  const lastOf = (list: { date: string; value: number }[], day: string) => list.filter((m) => m.date === day).at(-1)?.value ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">{me.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted"><Lock className="h-3.5 w-3.5" />Your wellness and nutrition records are private to you.</p>
        </div>
        <div className="flex gap-2">{others.map((o) => <Link key={o.id} href={`/people?member=${o.id}`} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: o.color }} />{o.name}</Link>)}</div>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        {[["Age", age ?? "—"], ["Weight", lastWeight ? `${lastWeight} kg` : "—"], ["Goal", me.goalWeightKg ? `${me.goalWeightKg} kg` : "—"], ["BMI", bmi ? bmi.toFixed(1) : "—"], ["Daily target", target ? `${target.kcal} kcal` : "—"]].map(([k, v]) => (
          <Card key={k} className="p-4"><p className="text-xs text-muted">{k}</p><p className="mt-0.5 text-xl font-semibold tabular">{v}</p></Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Weight" sub="Last 6 months" />
          <CardBody>{weights.length ? <TrendLine data={[...new Map(weights.map((w) => [w.date, { date: w.date, kg: w.value }])).values()]} x="date" xFmt="date" fmt="kg" series={[{ key: "kg", name: "Weight" }]} reference={me.goalWeightKg} referenceLabel="goal" /> : <p className="text-sm text-muted">Log your weight to see the trend.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Log a measurement" />
          <CardBody className="space-y-4">
            <MetricForm />
            <ul className="divide-y divide-line text-sm">
              {recentMetrics.map((m) => <li key={m.id} className="flex items-center gap-3 py-1.5"><span className="w-24 text-muted">{relativeDay(m.date)}</span><span className="flex-1">{METRIC_TYPES[m.type as keyof typeof METRIC_TYPES]?.label ?? m.type}{m.source === "APPLE_HEALTH" ? <Badge className="ml-2" tone="info">Health</Badge> : null}</span><span className="tabular">{m.value} {m.unit}</span><InlineAction action={deleteMetricAction} fields={{ id: m.id }} variant="ghost" size="iconSm" title="Delete"><Trash2 className="h-3.5 w-3.5" /></InlineAction></li>)}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Steps" sub="Last 14 days" />
          <CardBody>{steps.length ? <Bars data={fortnight.map((day) => ({ date: day, steps: lastOf(steps, day) }))} x="date" xFmt="date" series={[{ key: "steps", name: "Steps" }]} height={180} /> : <p className="text-sm text-muted">No steps logged.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Sleep" sub="Last 14 days" />
          <CardBody>{sleep.length ? <Bars data={fortnight.map((day) => ({ date: day, h: lastOf(sleep, day) }))} x="date" xFmt="date" series={[{ key: "h", name: "Hours" }]} height={180} /> : <p className="text-sm text-muted">No sleep logged.</p>}</CardBody>
        </Card>
        {activeEnergy.length ? (
          <Card className="lg:col-span-2">
            <CardHeader title="Active energy" sub="Last 14 days · from Apple Health" />
            <CardBody><Bars data={fortnight.map((day) => ({ date: day, kcal: lastOf(activeEnergy, day) }))} x="date" xFmt="date" series={[{ key: "kcal", name: "kcal" }]} fmt="kcal" height={160} /></CardBody>
          </Card>
        ) : null}
      </div>

      <SectionTitle><span id="health">Apple Health</span></SectionTitle>
      <Card>
        <CardHeader icon={<HealthIcon />} title="Apple Health & Fitness" sub="Bring in your history and keep new data flowing in — private to you." />
        <CardBody><HealthCard lastImport={lastImportRow ? JSON.parse(lastImportRow.value) : null} lastSync={lastSyncRow?.value ?? null} hasKey={Boolean(me.healthTokenHash)} /></CardBody>
      </Card>

      <SectionTitle action={<WorkoutDialog />}>Exercise</SectionTitle>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader title="Minutes per week" sub="Last 12 weeks" /><CardBody>{workouts.length ? <Bars data={weeks} x="week" xFmt="date" series={[{ key: "minutes", name: "Minutes" }]} fmt="min" height={180} /> : <p className="text-sm text-muted">No workouts in the last 12 weeks.</p>}</CardBody></Card>
        <Card>
          <CardHeader title="Recent workouts" />
          <ul className="divide-y divide-line border-t border-line text-sm">
            {workouts.slice(0, 8).map((w) => <li key={w.id} className="flex items-center gap-3 px-5 py-2"><span className="w-24 text-muted">{relativeDay(w.date)}</span><span className="flex-1">{w.type}{w.source === "APPLE_HEALTH" ? <Badge className="ml-2" tone="info">Health</Badge> : null}{w.notes ? <span className="text-faint"> · {w.notes}</span> : null}</span><span className="tabular text-muted">{w.durationMin} min{w.distanceKm ? ` · ${w.distanceKm} km` : ""}</span><InlineAction action={deleteWorkoutAction} fields={{ id: w.id }} variant="ghost" size="iconSm" title="Delete"><Trash2 className="h-3.5 w-3.5" /></InlineAction></li>)}
            {!workouts.length ? <li className="px-5 py-4 text-faint">No workouts logged.</li> : null}
          </ul>
        </Card>
      </div>

      <SectionTitle>Habits</SectionTitle>
      <Card>
        <CardBody className="space-y-4 pt-5">
          {habits.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-faint"><th className="pb-2 text-left font-medium">Habit</th>{habits[0].week.map((w) => <th key={w.date} className={cn("pb-2 font-medium", w.date === d && "text-accent")}>{weekdayName(weekday(w.date))}</th>)}<th className="pb-2 text-right font-medium">Week</th><th className="pb-2 text-right font-medium">Streak</th><th /></tr></thead>
                <tbody>
                  {habits.map((h) => (
                    <tr key={h.id} className="border-t border-line">
                      <td className="py-2 pr-3">{h.name}</td>
                      {h.week.map((w) => <td key={w.date} className="text-center">{w.date <= d ? <InlineAction action={toggleHabitAction} fields={{ id: h.id, date: w.date }} variant="ghost" size="iconSm" title={w.done ? "Undo" : "Done"}>{w.done ? <CheckCircle2 className="h-5 w-5 text-accent" /> : <Circle className="h-5 w-5 text-faint" />}</InlineAction> : <span className="text-faint">·</span>}</td>)}
                      <td className="text-right tabular">{h.weekCount}/{h.targetPerWeek}</td>
                      <td className="text-right tabular">{h.streak}d</td>
                      <td className="text-right"><InlineAction action={deletePersonalAction} fields={{ kind: "habit", id: h.id }} variant="ghost" size="iconSm" confirm="Delete habit and its history?" title="Delete"><Trash2 className="h-3.5 w-3.5" /></InlineAction></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-muted">No habits yet.</p>}
          <HabitForm />
        </CardBody>
      </Card>

      <SectionTitle action={<RoutineDialog />}><span id="routines">Routines</span></SectionTitle>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {allRoutines.map((r) => {
          const today_ = routines.find((x) => x.id === r.id);
          return (
            <Card key={r.id} className="p-4">
              <div className="flex items-center gap-2">
                {today_ ? <InlineAction action={toggleRoutineAction} fields={{ id: r.id, date: d }} variant="ghost" size="iconSm" title="Toggle today">{today_.done ? <CheckCircle2 className="h-5 w-5 text-accent" /> : <Circle className="h-5 w-5" />}</InlineAction> : null}
                <p className="flex-1 font-medium">{r.name}</p>
                <Badge>{r.time ?? r.timeOfDay.toLowerCase()}</Badge>
                <InlineAction action={deletePersonalAction} fields={{ kind: "routine", id: r.id }} variant="ghost" size="iconSm" confirm="Delete routine?" title="Delete"><Trash2 className="h-3.5 w-3.5" /></InlineAction>
              </div>
              <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm text-muted">{(JSON.parse(r.steps) as string[]).map((s, i) => <li key={i}>{s}</li>)}</ol>
              <p className="mt-2 text-xs text-faint">{r.schedule?.byWeekday ? r.schedule.byWeekday.split(",").map((x) => weekdayName(Number(x))).join(", ") : "Every day"}{today_ ? "" : " · not scheduled today"}</p>
            </Card>
          );
        })}
        {!allRoutines.length ? <p className="text-sm text-muted">No routines yet.</p> : null}
      </div>

      <SectionTitle><span id="targets">Nutrition targets</span></SectionTitle>
      <Card><CardBody className="pt-5"><TargetsForm t={target ? { kcal: target.kcal, protein: target.protein, carbs: target.carbs, fat: target.fat, fibre: target.fibre } : null} />{target ? <p className="mt-3 text-xs text-faint">Current since {formatDate(target.effectiveFrom, { year: true })} ({target.method === "MIFFLIN_ST_JEOR" ? "estimated" : "manual"}). Meal portions added from now on use the new targets.</p> : null}</CardBody></Card>

      <SectionTitle>Profile</SectionTitle>
      <Card><CardBody className="pt-5"><ProfileForm p={{ birthDate: me.birthDate, sex: me.sex, heightCm: me.heightCm, goalWeightKg: me.goalWeightKg, activityLevel: me.activityLevel, goal: me.goal, dietPreferences: me.dietPreferences, fitnessGoals: me.fitnessGoals }} /></CardBody></Card>

      {others.length ? (
        <>
          <SectionTitle>Sharing</SectionTitle>
          <Card>
            <CardHeader icon={<Shield className="h-4 w-4 text-accent" />} title="What others can see" sub="Everything is private unless you switch it on. Projects stay private regardless." />
            <ul className="divide-y divide-line border-t border-line">
              {others.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="w-28 font-medium">{o.name}</span>
                  {ACCESS_SCOPES.map((s) => {
                    const on = grants.some((g) => g.granteeProfileId === o.id && g.scope === s);
                    return <InlineAction key={s} action={setAccessAction} fields={{ grantee: o.id, scope: s }} variant={on ? "primary" : "outline"} size="sm">{on ? "✓ " : ""}{s}</InlineAction>;
                  })}
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}
    </div>
  );
}

async function MemberWeights({ viewerId, ownerId }: { viewerId: string; ownerId: string }) {
  const w = await listMetrics({ profileId: viewerId }, ownerId, "WEIGHT", 180);
  return <Card><CardHeader title="Weight (shared with you)" /><CardBody>{w.length ? <TrendLine data={w.map((x) => ({ date: x.date, kg: x.value }))} x="date" xFmt="date" fmt="kg" series={[{ key: "kg", name: "Weight" }]} /> : <p className="text-sm text-muted">No data.</p>}</CardBody></Card>;
}
async function MemberNutrition({ viewerId, ownerId }: { viewerId: string; ownerId: string }) {
  const l = await dayLog({ profileId: viewerId }, ownerId, today());
  return <Card><CardHeader title="Nutrition today (shared with you)" /><CardBody><p className="tabular">{l.totals.kcal}{l.target ? ` / ${l.target.kcal}` : ""} kcal · P {l.totals.protein} g · C {l.totals.carbs} g · F {l.totals.fat} g</p></CardBody></Card>;
}
async function MemberWorkouts({ viewerId, ownerId }: { viewerId: string; ownerId: string }) {
  const w = await listWorkouts({ profileId: viewerId }, ownerId, 30);
  return <Card><CardHeader title="Workouts, last 30 days (shared with you)" /><CardBody className="text-sm">{w.length ? w.map((x) => <p key={x.id}>{formatDate(x.date)} · {x.type} · {x.durationMin} min</p>) : <p className="text-muted">None.</p>}</CardBody></Card>;
}
