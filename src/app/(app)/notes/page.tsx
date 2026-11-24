import { PageHeader } from "@/components/ui";
import { NotesBoard } from "@/components/notes/notes-board";
export const metadata = { title: "Notes" };
export default function NotesPage() {
  return (<><PageHeader title="Notes" sub="Quick notes, checklists and ideas. Private by default; share with the household when useful. Open the notes panel from any screen with the note icon in the top bar." /><NotesBoard /></>);
}
