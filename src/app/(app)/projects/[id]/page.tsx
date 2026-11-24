import { notFound } from "next/navigation";
import { Trash2, ArrowUp, ArrowDown, Archive, Lock, Bell, ChartLine } from "lucide-react";
import { requireViewer } from "@/lib/auth/session";
import { getOwnProject, listEntries } from "@/lib/projects/projects";
import { FIELD_TYPE_LABELS, type FieldType } from "@/lib/projects/schema";
import { safeJson } from "@/lib/utils";
import { formatDate, relativeDay, addDays, today, startOfWeek, weekdayName } from "@/lib/dates";
import { parseWeekdays } from "@/lib/recurrence";
import { Card, CardHeader, CardBody, Badge, Field, Input, Textarea, SectionTitle } from "@/components/ui";
import { ActionForm, InlineAction, SubmitButton } from "@/components/forms";
import { EntryForm, type FieldDTO } from "@/components/projects/entry-form";
import { FieldDialog, EditEntryDialog } from "@/components/projects/manage";
import { TrendLine } from "@/components/charts";
import { ForbiddenError } from "@/lib/auth/access";
import { deleteEntryAction, archiveFieldAction, moveFieldAction, integrationStatusAction, addIntegrationAction, addReminderAction, deleteReminderAction, updateProjectAction, deleteProjectAction } from "../actions";

function display(v: unknown, type: string): string {
  if (v === null || v === undefined || v === "") return "—";
  if (type === "BOOLEAN") return v ? "Yes" : "No";
  if (type === "CHECKLIST" && Array.isArray(v)) return (v as { text: string; done: boolean }[]).map((c) => `${c.done ? "☑" : "☐"} ${c.text}`).join("  ");
  if (Array.isArray(v)) return v.join(", ");
  if (type === "DURATION") return `${v} min`;
  return String(v);
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  let project;
  try { project = await getOwnProject(viewer, id); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  const entries = await listEntries(viewer, id, 200);
  const fields: FieldDTO[] = project.fields.map((f) => ({ id: f.id, key: f.key, label: f.label, type: f.type, required: f.required, config: safeJson(f.config, {}) }));
  const numericKeys = fields.filter((f) => ["NUMBER", "RATING", "DURATION", "BOOLEAN"].includes(f.type)).map((f) => f.key);
  const chartField = fields.find((f) => ["RATING", "NUMBER", "DURATION"].includes(f.type));
  const days = new Set(entries.map((e) => e.date));
  let streak = 0;
  for (let d = days.has(today()) ? today() : addDays(today(), -1); days.has(d); d = addDays(d, -1)) streak++;
  const chart = chartField ? [...entries].reverse().filter((e) => e.parsed[chartField.key] !== null && e.parsed[chartField.key] !== undefined && e.parsed[chartField.key] !== "").slice(-60).map((e) => ({ date: e.date, v: Number(e.parsed[chartField.key]) })) : [];
  const thisWeek = entries.filter((e) => e.date >= startOfWeek(today())).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">{project.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted"><Lock className="h-3.5 w-3.5" />Private · {entries.length} entries · {thisWeek} this week · {streak}-day streak</p>
          {project.description ? <p className="mt-2 max-w-2xl text-sm text-muted">{project.description}</p> : null}
        </div>
        <InlineAction action={deleteProjectAction} fields={{ projectId: id }} variant="danger" confirm="Delete this project and all its entries permanently?"><Trash2 className="h-4 w-4" />Delete</InlineAction>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card><CardHeader title="New entry" /><CardBody>{fields.length ? <EntryForm projectId={id} fields={fields} /> : <p className="text-sm text-muted">Add a field first.</p>}</CardBody></Card>
          {chartField && chart.length > 1 ? <Card><CardHeader icon={<ChartLine className="h-4 w-4 text-accent" />} title={chartField.label} sub="Your entries over time" /><CardBody><TrendLine data={chart} x="date" xFmt="date" series={[{ key: "v", name: chartField.label }]} height={180} /></CardBody></Card> : null}
          <SectionTitle>Entries</SectionTitle>
          {entries.length ? entries.map((e) => (
            <Card key={e.id} className="p-4">
              <div className="mb-2 flex items-center gap-2"><p className="flex-1 font-medium">{formatDate(e.date, { weekday: true, year: true })}</p><EditEntryDialog projectId={id} fields={fields} entry={{ id: e.id, date: e.date, values: e.parsed }} /><InlineAction action={deleteEntryAction} fields={{ projectId: id, id: e.id }} variant="ghost" size="iconSm" confirm="Delete entry?" title="Delete"><Trash2 className="h-3.5 w-3.5" /></InlineAction></div>
              <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[180px_1fr]">
                {fields.map((f) => (
                  <div key={f.id} className="contents">
                    <dt className="text-xs text-faint sm:pt-0.5">{f.label}</dt>
                    <dd className="whitespace-pre-wrap text-sm">{f.type === "IMAGE" && e.parsed[f.key] ? <img src={`/api/files/${e.parsed[f.key]}`} alt="" className="h-24 rounded-lg border border-line" /> : display(e.parsed[f.key], f.type)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )) : <p className="text-sm text-faint">No entries yet.</p>}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Fields" action={<FieldDialog projectId={id} otherKeys={numericKeys} />} />
            <ul className="divide-y divide-line border-t border-line">
              {fields.map((f) => (
                <li key={f.id} className="flex items-center gap-1 px-4 py-2 text-sm">
                  <span className="min-w-0 flex-1">{f.label}{f.required ? " *" : ""}<span className="block text-xs text-faint">{FIELD_TYPE_LABELS[f.type as FieldType]}{f.type === "FORMULA" ? `: ${f.config.expression}` : ""}</span></span>
                  <InlineAction action={moveFieldAction} fields={{ projectId: id, id: f.id, dir: "up" }} variant="ghost" size="iconSm" title="Move up"><ArrowUp className="h-3.5 w-3.5" /></InlineAction>
                  <InlineAction action={moveFieldAction} fields={{ projectId: id, id: f.id, dir: "down" }} variant="ghost" size="iconSm" title="Move down"><ArrowDown className="h-3.5 w-3.5" /></InlineAction>
                  <FieldDialog projectId={id} field={f} otherKeys={numericKeys.filter((k) => k !== f.key)} />
                  <InlineAction action={archiveFieldAction} fields={{ projectId: id, id: f.id }} variant="ghost" size="iconSm" confirm="Remove this field? Existing entry values are kept in the data." title="Remove"><Archive className="h-3.5 w-3.5" /></InlineAction>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader icon={<Bell className="h-4 w-4 text-accent" />} title="Reminders" sub="Private — appear only on your calendar" />
            <CardBody className="space-y-2">
              {project.reminders.map((r) => <div key={r.id} className="flex items-center justify-between text-sm"><span>{r.time} · {parseWeekdays(r.weekdays).length === 7 ? "daily" : parseWeekdays(r.weekdays).map((d) => weekdayName(d)).join(", ")}<span className="block text-xs text-faint">{r.message}</span></span><InlineAction action={deleteReminderAction} fields={{ projectId: id, id: r.id }} variant="ghost" size="iconSm" title="Delete"><Trash2 className="h-3.5 w-3.5" /></InlineAction></div>)}
              <ActionForm action={addReminderAction} className="flex items-end gap-2 pt-1">
                <input type="hidden" name="projectId" value={id} />
                <Field label="Time"><Input type="time" name="time" required className="h-10 w-32" /></Field>
                <Field label="Message" className="flex-1"><Input name="message" className="h-10" placeholder={`Time for ${project.name}`} /></Field>
                <SubmitButton variant="secondary" size="sm">Add</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Integrations" sub="Share an aggregate number with household Insights. Entry content never leaves this project." />
            <CardBody className="space-y-3">
              {project.integrations.map((ig) => {
                const cfg = safeJson<{ metric: string; fieldKey?: string; label: string }>(ig.config, { metric: "entry_count", label: "" });
                return (
                  <div key={ig.id} className="rounded-xl bg-surface-2 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2"><span className="font-medium">{cfg.label}</span><Badge tone={ig.status === "APPROVED" ? "accent" : ig.status === "PROPOSED" ? "warn" : "neutral"}>{ig.status.toLowerCase()}</Badge></div>
                    <p className="mt-0.5 text-xs text-faint">Weekly {cfg.metric.replace("_", " ")}{cfg.fieldKey ? ` of ${cfg.fieldKey}` : ""} → Insights (visible to the household)</p>
                    <div className="mt-2 flex gap-2">
                      {ig.status !== "APPROVED" ? <InlineAction action={integrationStatusAction} fields={{ projectId: id, id: ig.id, status: "APPROVED" }} variant="primary">Approve sharing</InlineAction> : null}
                      {ig.status !== "REVOKED" ? <InlineAction action={integrationStatusAction} fields={{ projectId: id, id: ig.id, status: "REVOKED" }} variant="ghost">{ig.status === "APPROVED" ? "Stop sharing" : "Reject"}</InlineAction> : null}
                    </div>
                  </div>
                );
              })}
              <ActionForm action={addIntegrationAction} className="grid grid-cols-2 gap-2 border-t border-line pt-3">
                <input type="hidden" name="projectId" value={id} />
                <Field label="Label" className="col-span-2"><Input name="label" className="h-10" placeholder="Meditation sessions" required /></Field>
                <Field label="Metric"><select name="metric" className="h-10 w-full rounded-xl border border-line-strong bg-surface-2 px-2 text-sm"><option value="entry_count">Entry count</option><option value="field_sum">Sum of field</option><option value="field_average">Average of field</option></select></Field>
                <Field label="Field"><select name="fieldKey" className="h-10 w-full rounded-xl border border-line-strong bg-surface-2 px-2 text-sm"><option value="">—</option>{numericKeys.map((k) => <option key={k}>{k}</option>)}</select></Field>
                <div className="col-span-2 flex justify-end"><SubmitButton variant="secondary" size="sm">Propose</SubmitButton></div>
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <ActionForm action={updateProjectAction} resetOnSuccess={false} className="space-y-2">
                <input type="hidden" name="projectId" value={id} />
                <Input name="name" defaultValue={project.name} />
                <Textarea name="description" defaultValue={project.description} className="min-h-16" />
                <div className="flex justify-end"><SubmitButton variant="secondary" size="sm">Save</SubmitButton></div>
              </ActionForm>
              <p className="mt-2 text-xs text-faint">Created {relativeDay(project.createdAt.toISOString().slice(0, 10)).toLowerCase()}.</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
