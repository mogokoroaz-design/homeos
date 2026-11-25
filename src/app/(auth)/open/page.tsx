import { OpenProfile } from "./open-profile";

export const dynamic = "force-dynamic";

/** Shown for a moment while HomeOS opens the device's profile (no PIN) or hands over to the profile picker. */
export default async function OpenPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <OpenProfile next={next ?? "/today"} />
    </main>
  );
}
