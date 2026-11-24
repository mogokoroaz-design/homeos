import { backupArchive } from "@/lib/backup";
import { withViewer } from "../../_util";

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  return withViewer(async () => {
    const { name } = await params;
    const data = await backupArchive(name);
    return new Response(new Uint8Array(data), { headers: { "content-type": "application/x-tar", "content-disposition": `attachment; filename="${name}.tar"` } });
  });
}
