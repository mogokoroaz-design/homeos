import { exportForViewer } from "@/lib/backup";
import { audit } from "@/lib/audit";
import { withViewer } from "../_util";

export async function GET() {
  return withViewer(async (viewer) => {
    const data = await exportForViewer(viewer);
    await audit({ profileId: viewer.profileId, action: "privacy.export", entityType: "profile", entityId: viewer.profileId, summary: "Exported data" });
    return new Response(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="homeos-export-${viewer.name.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json"` } });
  });
}
