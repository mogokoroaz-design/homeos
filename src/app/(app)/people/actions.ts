"use server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth/session";
import { run, runVoid } from "@/lib/action";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/validation";
import { dateString, num, reqNum, timeString, METRIC_TYPES, optionalDate } from "@/lib/validation";
import { addMetric, addWorkout, createHabit, toggleHabit, createRoutine, toggleRoutine, deleteMetric, deleteWorkout, deletePersonalItem } from "@/lib/personal/wellness";
import { estimateTargets } from "@/lib/food/nutrition";
import { proposeAction } from "@/lib/ai/actions";
import { ACCESS_SCOPES } from "@/lib/auth/access";
import { today } from "@/lib/dates";
import { audit } from "@/lib/audit";

export async function updateProfileAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    await prisma.householdProfile.update({
      where: { id: viewer.profileId },
      data: {
        birthDate: optionalDate.parse(fd.get("birthDate") ?? ""), sex: z.enum(["male", "female", "unspecified"]).parse(fd.get("sex") || "unspecified"), heightCm: num.parse(fd.get("heightCm")) ?? null,
        goalWeightKg: num.parse(fd.get("goalWeightKg")) ?? null, activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]).parse(fd.get("activityLevel")),
        goal: z.enum(["lose", "maintain", "gain"]).parse(fd.get("goal")), dietPreferences: String(fd.get("dietPreferences") ?? "").slice(0, 500), fitnessGoals: String(fd.get("fitnessGoals") ?? "").slice(0, 500),
      },
    });
  }, "Profile updated");
}

/** Estimated targets are proposed for approval; they are never applied automatically. */
export async function proposeTargetsAction(): Promise<ActionResult<{ actionId: string; preview: unknown }>> {
  const viewer = await requireViewer();
  return run(async () => {
    const p = await prisma.householdProfile.findUniqueOrThrow({ where: { id: viewer.profileId } });
    const w = await prisma.wellnessMetric.findFirst({ where: { profileId: viewer.profileId, type: "WEIGHT" }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
    const est = estimateTargets({ weightKg: w?.value ?? null, heightCm: p.heightCm, birthDate: p.birthDate, sex: p.sex, activityLevel: p.activityLevel, goal: p.goal });
    if (!est.ok) throw new Error(est.reason);
    const payload = { profileId: viewer.profileId, kcal: est.kcal, protein: est.protein, carbs: est.carbs, fat: est.fat, fibre: est.fibre, method: "MIFFLIN_ST_JEOR" };
    const a = await proposeAction(viewer, "NUTRITION_TARGETS", `Set targets to ${est.kcal} kcal (BMR ${est.bmr}, maintenance ≈ ${est.tdee})`, payload);
    return { actionId: a.id, preview: payload };
  });
}
export async function setTargetsAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    const kcal = reqNum.parse(fd.get("kcal"));
    if (kcal < 800 || kcal > 6000) throw new Error("Calories should be between 800 and 6000");
    await prisma.nutritionTarget.create({ data: { profileId: viewer.profileId, kcal, protein: reqNum.parse(fd.get("protein")), carbs: reqNum.parse(fd.get("carbs")), fat: reqNum.parse(fd.get("fat")), fibre: num.parse(fd.get("fibre")) ?? Math.round((kcal / 1000) * 14), method: "MANUAL", effectiveFrom: today() } });
    await audit({ profileId: viewer.profileId, action: "targets.set", entityType: "nutritionTarget", summary: `${kcal} kcal` });
  }, "Targets updated — new meal portions will use them");
}
export async function addMetricAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(() => addMetric(viewer, { date: dateString.parse(fd.get("date")), type: z.enum(Object.keys(METRIC_TYPES) as [keyof typeof METRIC_TYPES]).parse(fd.get("type")), value: reqNum.parse(fd.get("value")), note: String(fd.get("note") ?? "") }), "Saved");
}
export async function deleteMetricAction(fd: FormData) { const v = await requireViewer(); await runVoid(() => deleteMetric(v, String(fd.get("id")))); }
export async function addWorkoutAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(() => addWorkout(viewer, { date: dateString.parse(fd.get("date")), type: z.string().trim().min(1, "Type required").parse(fd.get("type")), durationMin: Math.round(reqNum.parse(fd.get("duration"))), distanceKm: num.parse(fd.get("distance")) ?? null, kcalBurned: num.parse(fd.get("kcal")) ?? null, intensity: String(fd.get("intensity") || "moderate"), notes: String(fd.get("notes") ?? "") }), "Workout logged");
}
export async function deleteWorkoutAction(fd: FormData) { const v = await requireViewer(); await runVoid(() => deleteWorkout(v, String(fd.get("id")))); }
export async function createHabitAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(() => createHabit(viewer, z.string().trim().min(1, "Name required").max(80).parse(fd.get("name")), Number(fd.get("target") || 7)), "Habit added");
}
export async function toggleHabitAction(fd: FormData) { const v = await requireViewer(); await runVoid(() => toggleHabit(v, String(fd.get("id")), dateString.parse(fd.get("date")))); }
export async function createRoutineAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(() => createRoutine(viewer, { name: z.string().trim().min(1, "Name required").parse(fd.get("name")), timeOfDay: String(fd.get("timeOfDay") || "MORNING"), time: timeString.parse(fd.get("time")), steps: String(fd.get("steps") ?? "").split("\n").map((s) => s.trim()).filter(Boolean), weekdays: fd.getAll("weekday").map(String).join(","), startDate: today() }), "Routine added");
}
export async function toggleRoutineAction(fd: FormData) { const v = await requireViewer(); await runVoid(() => toggleRoutine(v, String(fd.get("id")), dateString.parse(fd.get("date")))); }
export async function deletePersonalAction(fd: FormData) { const v = await requireViewer(); await runVoid(() => deletePersonalItem(v, fd.get("kind") === "habit" ? "habit" : "routine", String(fd.get("id")))); }

export async function setAccessAction(fd: FormData) {
  const viewer = await requireViewer();
  await runVoid(async () => {
    const grantee = String(fd.get("grantee"));
    const scope = z.enum(ACCESS_SCOPES as [string, ...string[]]).parse(fd.get("scope"));
    if (grantee === viewer.profileId) throw new Error("Invalid");
    const where = { ownerProfileId_granteeProfileId_scope: { ownerProfileId: viewer.profileId, granteeProfileId: grantee, scope } };
    const existing = await prisma.profileAccess.findUnique({ where });
    if (existing) await prisma.profileAccess.delete({ where });
    else await prisma.profileAccess.create({ data: { ownerProfileId: viewer.profileId, granteeProfileId: grantee, scope } });
    await audit({ profileId: viewer.profileId, action: existing ? "access.revoke" : "access.grant", entityType: "profileAccess", entityId: grantee, summary: `${scope}` });
  });
}
