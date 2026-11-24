import { PageHeader } from "@/components/ui";
import { ProjectBuilder } from "@/components/projects/builder";
export const metadata = { title: "New project" };
export default function NewProjectPage() {
  return (<><PageHeader title="Project builder" sub="Describe it naturally. You review and edit the proposed structure before anything is created. Projects are built from validated field types — no generated code is ever run." /><ProjectBuilder /></>);
}
