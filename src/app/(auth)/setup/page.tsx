import { redirect } from "next/navigation";
import { householdExists } from "@/lib/household";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await householdExists()) redirect("/lock");
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 py-12">
      <div className="mb-8">
        <img src="/icon.svg" alt="" className="mb-5 h-12 w-12" />
        <h1 className="text-3xl font-semibold tracking-tight">Set up HomeOS</h1>
        <p className="mt-2 text-muted">One household, a private space for each person. Everything is stored on this Mac — no accounts, no cloud.</p>
      </div>
      <SetupForm />
    </main>
  );
}
