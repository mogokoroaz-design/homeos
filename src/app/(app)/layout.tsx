import { requireViewer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Sidebar, MobileNav } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/topbar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const [household, profiles] = await Promise.all([
    prisma.household.findUnique({ where: { id: viewer.householdId } }),
    prisma.householdProfile.findMany({ select: { id: true, name: true, color: true, pinHash: true }, orderBy: { createdAt: "asc" } }),
  ]);
  return (
    <div className="flex min-h-dvh">
      <Sidebar householdName={household?.name ?? "HomeOS"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar viewer={{ name: viewer.name, color: viewer.color, profileId: viewer.profileId }} profiles={profiles.map(({ pinHash, ...p }) => ({ ...p, hasPin: Boolean(pinHash) }))} />
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">{children}</main>
      </div>
      <MobileNav />
      <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost')){navigator.serviceWorker.register('/sw.js').catch(()=>{})}` }} />
    </div>
  );
}
