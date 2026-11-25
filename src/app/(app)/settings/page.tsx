import { Download, Database, Trash2, Shield, Bot, LayoutDashboard, ScrollText, HardDrive } from "lucide-react";
import { requireViewer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getAIConfig } from "@/lib/ai/provider";
import { getSetting } from "@/lib/settings";
import { listBackups } from "@/lib/backup";
import { dataDir } from "@/lib/paths";
import { safeJson } from "@/lib/utils";
import { Card, CardHeader, CardBody, PageHeader, Badge } from "@/components/ui";
import { InlineAction, SubmitButton } from "@/components/forms";
import { AISettings, SecuritySettings, RestoreDialog, ImportBackup, EraseMyData } from "@/components/settings/forms";
import { backupNowAction, deleteBackupAction, saveDashboardAction } from "./actions";

export const metadata = { title: "Settings" };
const WIDGETS: [string, string][] = [["meals", "Today's meals"], ["wellness", "My day (private)"], ["tasks", "Household tasks"], ["routines", "My routines"], ["agenda", "Coming up"], ["grocery", "Groceries"], ["bills", "Bills"], ["expiring", "Use soon"], ["spending", "Spending"], ["projects", "My projects"], ["notes", "Pinned notes"]];

export default async function SettingsPage() {
  const viewer = await requireViewer();
  const [ai, lock, backups, me, audits] = await Promise.all([getAIConfig(), getSetting("security.autoLockMinutes", "30"), listBackups(), prisma.householdProfile.findUniqueOrThrow({ where: { id: viewer.profileId } }), prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 40 })]);
  const hidden = new Set(safeJson<{ hidden?: string[] }>(me.dashboardConfig, {}).hidden ?? []);
  const profiles = await prisma.householdProfile.findMany({ select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="Settings" sub={<>Version <b className="text-ink">{process.env.NEXT_PUBLIC_HOMEOS_VERSION}</b> · Data folder: <code className="text-xs">{dataDir()}</code></>} />
      <div className="space-y-5">
        <Card>
          <CardHeader icon={<Bot className="h-4 w-4 text-accent" />} title="Assistant & AI" sub="Everything works without AI. Optional local AI runs on this Mac through Ollama (free); no data is ever sent to a cloud service." />
          <CardBody><AISettings provider={ai.provider} url={ai.ollamaUrl} model={ai.ollamaModel} visionModel={ai.visionModel} /></CardBody>
        </Card>
        <Card>
          <CardHeader icon={<LayoutDashboard className="h-4 w-4 text-accent" />} title="My Today dashboard" />
          <CardBody>
            <form action={saveDashboardAction} className="flex flex-wrap items-center gap-2">
              {WIDGETS.map(([k, label]) => <label key={k} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-sm has-[:checked]:border-accent/60 has-[:checked]:bg-accent-dim"><input type="checkbox" name="show" value={k} defaultChecked={!hidden.has(k)} className="accent-[#9cc2b0]" />{label}</label>)}
              <SubmitButton variant="secondary" size="sm">Save</SubmitButton>
            </form>
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={<Shield className="h-4 w-4 text-accent" />} title="Security" sub="A person's private records are protected by their PIN plus server-side access checks. Profiles without a PIN open with one tap." />
          <CardBody><SecuritySettings minutes={lock} /></CardBody>
        </Card>
        <Card>
          <CardHeader icon={<HardDrive className="h-4 w-4 text-accent" />} title="Backups" sub="Consistent snapshot of the database plus all photos and receipts, stored in the data folder. Download one to keep a copy elsewhere (e.g. an external drive)." action={<InlineAction action={backupNowAction} variant="primary" size="md"><Database className="h-4 w-4" />Back up now</InlineAction>} />
          <ul className="divide-y divide-line border-t border-line text-sm">
            {backups.map((b) => (
              <li key={b.name} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                <span className="min-w-56 flex-1">{new Date(b.createdAt).toLocaleString()} <Badge>{b.label}</Badge><span className="block text-xs text-faint">{b.name} · {(b.dbBytes / 1024).toFixed(0)} KB db · {Object.entries(b.counts).map(([k, v]) => `${v} ${k}`).join(", ")}</span></span>
                <a href={`/api/backup/${b.name}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line-strong px-3 text-sm hover:bg-surface-3"><Download className="h-4 w-4" />.tar</a>
                <RestoreDialog name={b.name} hasPin={Boolean(me.pinHash)} />
                <InlineAction action={deleteBackupAction} fields={{ name: b.name }} variant="ghost" size="iconSm" confirm="Delete this backup?" title="Delete"><Trash2 className="h-4 w-4" /></InlineAction>
              </li>
            ))}
            {!backups.length ? <li className="px-5 py-4 text-faint">No backups yet.</li> : null}
          </ul>
          <CardBody className="pt-4"><ImportBackup /></CardBody>
        </Card>
        <Card>
          <CardHeader icon={<Download className="h-4 w-4 text-accent" />} title="Your data" sub="Export includes shared household data plus your own private records — never another person's private data." />
          <CardBody className="flex flex-wrap gap-3">
            <a href="/api/export" className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong bg-surface-3 px-4 text-sm font-medium hover:bg-[#252a31]"><Download className="h-4 w-4" />Export my data (JSON)</a>
            <EraseMyData hasPin={Boolean(me.pinHash)} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={<ScrollText className="h-4 w-4 text-accent" />} title="Audit history" sub="Important changes. Private items are logged without their content." />
          <ul className="max-h-96 divide-y divide-line overflow-y-auto border-t border-line text-sm">
            {audits.map((a) => <li key={a.id} className="flex gap-3 px-5 py-2"><span className="w-36 shrink-0 text-xs text-faint">{a.createdAt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span><span className="w-20 shrink-0 text-xs text-muted">{profiles.find((p) => p.id === a.profileId)?.name ?? "system"}</span><span className="w-40 shrink-0 font-mono text-xs text-muted">{a.action}</span><span className="min-w-0 truncate">{a.summary}</span></li>)}
          </ul>
        </Card>
      </div>
    </>
  );
}
