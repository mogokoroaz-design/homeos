import Link from "next/link";
import { Plus, Lock, FolderKanban } from "lucide-react";
import { requireViewer } from "@/lib/auth/session";
import { listOwnProjects } from "@/lib/projects/projects";
import { relativeDay } from "@/lib/dates";
import { Card, PageHeader, LinkButton, Empty, Badge } from "@/components/ui";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const viewer = await requireViewer();
  const projects = await listOwnProjects(viewer);
  return (
    <>
      <PageHeader title="Projects" sub={<span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" />Journals, trackers and goals — private to {viewer.name}. Other profiles can never see them.</span>} actions={<LinkButton href="/projects/new" variant="primary"><Plus className="h-4 w-4" />New project</LinkButton>} />
      {projects.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="h-full p-5 hover:border-line-strong">
                <p className="font-semibold">{p.name}</p>
                {p.description ? <p className="mt-1 line-clamp-2 text-sm text-muted">{p.description}</p> : null}
                <div className="mt-3 flex flex-wrap gap-1.5"><Badge>{p._count.entries} entries</Badge>{p.entries[0] ? <Badge tone="accent">last {relativeDay(p.entries[0].date).toLowerCase()}</Badge> : null}</div>
              </Card>
            </Link>
          ))}
        </div>
      ) : <Empty icon={<FolderKanban className="h-7 w-7" />} title="No projects yet" action={<LinkButton href="/projects/new" variant="primary">Describe a project</LinkButton>}>Describe what you want to track in plain words — a journal, reading log, meditation tracker — and HomeOS proposes a structure for you to approve.</Empty>}
    </>
  );
}
