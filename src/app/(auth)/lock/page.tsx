import { redirect } from "next/navigation";
import { householdExists, listProfiles } from "@/lib/household";
import { prisma } from "@/lib/db";
import { PinPad } from "./pin-pad";

export const dynamic = "force-dynamic";

export default async function LockPage({ searchParams }: { searchParams: Promise<{ next?: string; profile?: string }> }) {
  if (!(await householdExists())) redirect("/setup");
  const [profiles, household] = await Promise.all([listProfiles(), prisma.household.findFirst()]);
  const { next, profile } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center px-5 py-12">
      <img src="/icon.svg" alt="" className="mb-4 h-11 w-11" />
      <p className="text-sm text-muted">{household?.name}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{profiles.find((p) => p.id === profile && p.hasPin) ? `Enter ${profiles.find((p) => p.id === profile)!.name}'s PIN` : "Who's using HomeOS?"}</h1>
      <PinPad initialProfileId={profile} profiles={profiles.map((p) => ({ id: p.id, name: p.name, color: p.color, hasPin: p.hasPin }))} next={next && next.startsWith("/") && !next.startsWith("//") ? next : "/today"} />
      <p className="mt-10 text-[11px] text-faint">Version {process.env.NEXT_PUBLIC_HOMEOS_VERSION}</p>
    </main>
  );
}
