import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { prisma } from "@/lib/db";
import { seedHousehold } from "../helpers";
import { importHealthExport, createHealthSyncKey, profileForSyncKey, applySync, syncPayload, mergedHours } from "@/lib/personal/health";
import { listMetrics, listWorkouts } from "@/lib/personal/wellness";
import { ForbiddenError } from "@/lib/auth/access";
import type { Viewer } from "@/lib/auth/session";

let alex: Viewer, sam: Viewer;
const dir = path.resolve("data/test/health");

// A trimmed but structurally faithful Apple Health export.xml.
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [ <!ELEMENT HealthData (ExportDate,Me,(Record|Correlation|Workout|ActivitySummary)*)> ]>
<HealthData locale="en_US">
 <ExportDate value="2026-11-22 09:00:00 -0800"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Aarzoo’s iPhone" unit="count" creationDate="2026-11-20 10:00:00 -0800" startDate="2026-11-20 08:00:00 -0800" endDate="2026-11-20 09:00:00 -0800" value="4000"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Aarzoo’s iPhone" unit="count" creationDate="2026-11-20 18:00:00 -0800" startDate="2026-11-20 17:00:00 -0800" endDate="2026-11-20 18:00:00 -0800" value="2500"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Aarzoo’s Apple Watch" unit="count" creationDate="2026-11-20 18:00:00 -0800" startDate="2026-11-20 08:00:00 -0800" endDate="2026-11-20 18:00:00 -0800" value="7100">
  <MetadataEntry key="HKMetadataKeyDevicePlacementSide" value="0"/>
 </Record>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Aarzoo’s iPhone" unit="count" startDate="2025-01-01 08:00:00 -0800" endDate="2025-01-01 09:00:00 -0800" value="999"/>
 <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Health" unit="lb" startDate="2026-11-20 07:00:00 -0800" endDate="2026-11-20 07:00:00 -0800" value="150"/>
 <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Health" unit="lb" startDate="2026-11-20 21:00:00 -0800" endDate="2026-11-20 21:00:00 -0800" value="152"/>
 <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="Aarzoo’s Apple Watch" unit="kJ" startDate="2026-11-20 08:00:00 -0800" endDate="2026-11-20 20:00:00 -0800" value="1673.6"/>
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Aarzoo’s Apple Watch" unit="count/min" startDate="2026-11-20 00:00:00 -0800" endDate="2026-11-20 23:59:00 -0800" value="58"/>
 <Record type="HKQuantityTypeIdentifierDietaryWater" sourceName="WaterMinder" unit="mL" startDate="2026-11-20 12:00:00 -0800" endDate="2026-11-20 12:00:00 -0800" value="500"/>
 <Record type="HKQuantityTypeIdentifierDietaryWater" sourceName="WaterMinder" unit="mL" startDate="2026-11-20 15:00:00 -0800" endDate="2026-11-20 15:00:00 -0800" value="750"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Aarzoo’s Apple Watch" startDate="2026-11-20 23:00:00 -0800" endDate="2026-11-21 03:00:00 -0800" value="HKCategoryValueSleepAnalysisAsleepCore"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Aarzoo’s Apple Watch" startDate="2026-11-21 03:00:00 -0800" endDate="2026-11-21 03:20:00 -0800" value="HKCategoryValueSleepAnalysisAwake"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Aarzoo’s Apple Watch" startDate="2026-11-21 03:20:00 -0800" endDate="2026-11-21 06:30:00 -0800" value="HKCategoryValueSleepAnalysisAsleepDeep"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Sleep Cycle" startDate="2026-11-21 00:00:00 -0800" endDate="2026-11-21 06:00:00 -0800" value="HKCategoryValueSleepAnalysisAsleepUnspecified"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="32.5" durationUnit="min" sourceName="Aarzoo’s Apple Watch" startDate="2026-11-20 07:10:00 -0800" endDate="2026-11-20 07:42:30 -0800">
  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="2026-11-20 07:10:00 -0800" endDate="2026-11-20 07:42:30 -0800" sum="310.4" unit="kcal"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" startDate="2026-11-20 07:10:00 -0800" endDate="2026-11-20 07:42:30 -0800" sum="3.1" unit="mi"/>
 </Workout>
 <Workout workoutActivityType="HKWorkoutActivityTypeTraditionalStrengthTraining" duration="45" durationUnit="min" totalEnergyBurned="200" totalEnergyBurnedUnit="kcal" sourceName="Fitness" startDate="2026-11-21 18:00:00 -0800" endDate="2026-11-21 18:45:00 -0800"/>
</HealthData>
`;

beforeAll(async () => {
  ({ alex, sam } = await seedHousehold());
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "apple_health_export"), { recursive: true });
  fs.writeFileSync(path.join(dir, "apple_health_export", "export.xml"), XML);
  fs.writeFileSync(path.join(dir, "apple_health_export", "export_cda.xml"), "<ClinicalDocument/>");
  execSync("zip -qr export.zip apple_health_export", { cwd: dir });
});

describe("Apple Health import", () => {
  it("merges overlapping sleep intervals", () => {
    expect(mergedHours([[0, 4 * 3.6e6], [2 * 3.6e6, 6 * 3.6e6], [7 * 3.6e6, 8 * 3.6e6]])).toBe(7);
  });

  it("imports the export.zip into the uploader's private daily records without double counting", async () => {
    const s = await importHealthExport(alex.profileId, path.join(dir, "export.zip"), "2026-01-01");
    expect(s.workouts).toBe(2);
    const get = async (type: string) => (await prisma.wellnessMetric.findMany({ where: { profileId: alex.profileId, type }, orderBy: { date: "asc" } })).map((m) => [m.date, m.value, m.source]);
    expect(await get("STEPS")).toEqual([["2026-11-20", 7100, "APPLE_HEALTH"]]); // max(iPhone 6500, Watch 7100), not 13,600; 2025 record excluded by "since"
    expect(await get("WEIGHT")).toEqual([["2026-11-20", 68.9, "APPLE_HEALTH"]]); // latest weigh-in, 152 lb → kg
    expect(await get("ACTIVE_KCAL")).toEqual([["2026-11-20", 400, "APPLE_HEALTH"]]); // 1673.6 kJ
    expect(await get("RESTING_HR")).toEqual([["2026-11-20", 58, "APPLE_HEALTH"]]);
    expect(await get("WATER_ML")).toEqual([["2026-11-20", 1250, "APPLE_HEALTH"]]);
    // 23:00–06:30 asleep across Watch + Sleep Cycle, minus the 20-min awake gap the other app didn't cover → merged, attributed to wake-up day
    expect(await get("SLEEP_HOURS")).toEqual([["2026-11-21", 7.5, "APPLE_HEALTH"]]);
    const workouts = await prisma.workout.findMany({ where: { profileId: alex.profileId }, orderBy: { date: "asc" } });
    expect(workouts.map((w) => [w.date, w.type, w.durationMin, w.distanceKm, w.kcalBurned])).toEqual([["2026-11-20", "Running", 33, 4.99, 310], ["2026-11-21", "Strength", 45, null, 200]]);
  });

  it("re-importing updates instead of duplicating, and stays private", async () => {
    const before = await prisma.wellnessMetric.count();
    await importHealthExport(alex.profileId, path.join(dir, "export.zip"));
    expect(await prisma.wellnessMetric.count({ where: { date: { gte: "2026-01-01" } } })).toBe(before);
    expect(await prisma.wellnessMetric.count({ where: { date: "2025-01-01" } })).toBe(1); // no "since" this time
    expect(await prisma.workout.count()).toBe(2);
    expect(await prisma.wellnessMetric.count({ where: { profileId: sam.profileId } })).toBe(0);
    await expect(listMetrics(sam, alex.profileId, "STEPS")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listWorkouts(sam, alex.profileId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("accepts a bare export.xml and rejects unrelated zips", async () => {
    await expect(importHealthExport(sam.profileId, path.join(dir, "apple_health_export", "export.xml"))).resolves.toMatchObject({ workouts: 2 });
    fs.writeFileSync(path.join(dir, "notes.txt"), "hi");
    execSync("zip -q other.zip notes.txt", { cwd: dir });
    await expect(importHealthExport(alex.profileId, path.join(dir, "other.zip"))).rejects.toThrow(/no export.xml/);
  });
});

describe("Apple Health ongoing sync", () => {
  it("only a valid key writes, and only to its own profile; same-day updates overwrite", async () => {
    const key = await createHealthSyncKey(alex.profileId);
    expect((await prisma.householdProfile.findUniqueOrThrow({ where: { id: alex.profileId } })).healthTokenHash).not.toContain(key);
    expect(await profileForSyncKey("hos_wrong")).toBeNull();
    const p = await profileForSyncKey(key);
    expect(p?.id).toBe(alex.profileId);
    await applySync(p!.id, syncPayload.parse({ days: [{ date: "2026-11-23", steps: "5,432", sleepHours: 7.25, weightKg: "68.4" }], workouts: [{ start: "2026-11-23T07:00:00-08:00", type: "Walking", durationMin: 30, distanceKm: 2.4 }] }));
    await applySync(p!.id, syncPayload.parse({ days: [{ date: "2026-11-23", steps: 8100 }] }));
    const steps = await prisma.wellnessMetric.findMany({ where: { profileId: alex.profileId, type: "STEPS", date: "2026-11-23" } });
    expect(steps.map((s) => s.value)).toEqual([8100]);
    expect((await prisma.wellnessMetric.findFirstOrThrow({ where: { profileId: alex.profileId, type: "SLEEP_HOURS", date: "2026-11-23" } })).value).toBe(7.3);
    expect(await prisma.workout.count({ where: { profileId: alex.profileId, type: "Walking" } })).toBe(1);
  });
});
