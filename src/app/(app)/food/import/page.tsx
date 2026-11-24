import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardHeader, Badge, SectionTitle } from "@/components/ui";
import { ImportForms } from "@/components/food/import-forms";

export const metadata = { title: "Import recipe" };

export default async function ImportPage() {
  const imports = await prisma.recipeImport.findMany({ orderBy: { createdAt: "desc" }, take: 15 });
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <ImportForms />
        <p className="mt-3 text-xs text-faint">Every import becomes an editable draft. Nothing is saved to your library until you review and save it.</p>
      </div>
      <div>
        <SectionTitle>Recent imports</SectionTitle>
        <Card>
          <ul className="divide-y divide-line text-sm">
            {imports.map((i) => {
              const name = (JSON.parse(i.extracted || "{}") as { name?: string }).name;
              return (
                <li key={i.id}><Link href={i.status === "SAVED" && i.recipeId ? `/food/recipes/${i.recipeId}` : `/food/import/${i.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-surface-2">
                  <span className="min-w-0 truncate">{name || i.sourceUrl || i.method.toLowerCase()}</span>
                  <Badge tone={i.status === "SAVED" ? "accent" : i.status === "FAILED" ? "danger" : i.status === "DISCARDED" ? "neutral" : "warn"}>{i.status === "PENDING_REVIEW" ? "review" : i.status.toLowerCase()}</Badge>
                </Link></li>
              );
            })}
            {!imports.length ? <li className="px-4 py-4 text-faint">No imports yet.</li> : null}
          </ul>
        </Card>
      </div>
    </div>
  );
}
