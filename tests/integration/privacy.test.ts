import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { seedHousehold } from "../helpers";
import { addMetric, listMetrics, addWorkout, listWorkouts, habitsWithStatus, createHabit } from "@/lib/personal/wellness";
import { logManual, dayLog } from "@/lib/food/foodlog";
import { createProjectFromDef, getOwnProject, listOwnProjects, saveEntry, approvedProjectSummaries, setIntegrationStatus, listEntries } from "@/lib/projects/projects";
import { buildProjectProposal } from "@/lib/projects/builder";
import { saveNote, listNotes, deleteNote, toggleChecklistItem } from "@/lib/notes";
import { calendarItems } from "@/lib/calendar";
import { exportForViewer } from "@/lib/backup";
import { ForbiddenError } from "@/lib/auth/access";
import { hashPin, verifyPin } from "@/lib/auth/pin";
import { createExpense, monthSummary } from "@/lib/finance/ledger";
import { today, monthOf } from "@/lib/dates";
import type { Viewer } from "@/lib/auth/session";

let alex: Viewer, sam: Viewer;
beforeAll(async () => ({ alex, sam } = await seedHousehold()));

describe("profiles & privacy (acceptance 1–4)", () => {
  it("stores PINs only as salted hashes", async () => {
    const p = await prisma.householdProfile.findUniqueOrThrow({ where: { id: alex.profileId } });
    expect(p.pinHash).not.toContain("1234");
    expect(verifyPin("1234", p.pinHash, p.pinSalt)).toBe(true);
    expect(verifyPin("5678", p.pinHash, p.pinSalt)).toBe(false);
    expect(hashPin("1234").hash).not.toBe(hashPin("1234").hash);
  });

  it("keeps wellness, fitness, habits and nutrition private unless granted", async () => {
    await addMetric(alex, { date: today(), type: "WEIGHT", value: 72.5 });
    await addWorkout(alex, { date: today(), type: "Run", durationMin: 30 });
    await createHabit(alex, "Stretch", 5);
    await logManual(alex, { date: today(), slot: "LUNCH", description: "Sandwich", kcal: 450, fromLabel: false });
    expect((await listMetrics(alex, alex.profileId, "WEIGHT")).length).toBe(1);
    await expect(listMetrics(sam, alex.profileId, "WEIGHT")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listWorkouts(sam, alex.profileId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(habitsWithStatus(sam, alex.profileId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(dayLog(sam, alex.profileId, today())).rejects.toBeInstanceOf(ForbiddenError);
    // Explicit, scoped permission
    await prisma.profileAccess.create({ data: { ownerProfileId: alex.profileId, granteeProfileId: sam.profileId, scope: "wellness" } });
    expect((await listMetrics(sam, alex.profileId, "WEIGHT"))[0].value).toBe(72.5);
    await expect(dayLog(sam, alex.profileId, today())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("projects are private to their owner; only approved aggregates are shared", async () => {
    const { proposal } = buildProjectProposal("A meditation tracker");
    const p = await createProjectFromDef(alex, proposal);
    await saveEntry(alex, p.id, today(), { minutes: 15, notes: "very private thought" });
    await expect(getOwnProject(sam, p.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listEntries(sam, p.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveEntry(sam, p.id, today(), { minutes: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await listOwnProjects(sam)).toHaveLength(0);
    // Proposed integration shares nothing until approved
    expect(await approvedProjectSummaries()).toHaveLength(0);
    const ig = (await getOwnProject(alex, p.id)).integrations[0];
    await expect(setIntegrationStatus(sam, p.id, ig.id, "APPROVED")).rejects.toBeInstanceOf(ForbiddenError);
    await setIntegrationStatus(alex, p.id, ig.id, "APPROVED");
    const shared = await approvedProjectSummaries();
    expect(shared).toHaveLength(1);
    expect(shared[0].series.at(-1)!.value).toBe(1);
    expect(JSON.stringify(shared)).not.toContain("very private thought");
  });

  it("notes: private vs shared", async () => {
    const priv = await saveNote(alex, { title: "Gift ideas", body: "secret", visibility: "PRIVATE", checklist: [{ text: "a", done: false }] });
    const shared = await saveNote(alex, { title: "Cleaner instructions", body: "Water plants", visibility: "SHARED" });
    const samNotes = await listNotes(sam);
    expect(samNotes.map((n) => n.id)).toContain(shared.id);
    expect(samNotes.map((n) => n.id)).not.toContain(priv.id);
    await expect(toggleChecklistItem(sam, priv.id, 0)).rejects.toThrow();
    await expect(deleteNote(sam, priv.id)).rejects.toThrow();
    expect((await listNotes(alex, { q: "secret" })).map((n) => n.id)).toEqual([priv.id]);
  });

  it("calendar hides other people's private items", async () => {
    await prisma.calendarEvent.create({ data: { title: "Therapy", date: today(), visibility: "PRIVATE", ownerProfileId: alex.profileId, kind: "PERSONAL" } });
    await prisma.calendarEvent.create({ data: { title: "Dinner with friends", date: today(), visibility: "SHARED", ownerProfileId: alex.profileId } });
    const samItems = (await calendarItems(sam, today(), today())).map((i) => i.title);
    const alexItems = (await calendarItems(alex, today(), today())).map((i) => i.title);
    expect(samItems).toContain("Dinner with friends");
    expect(samItems).not.toContain("Therapy");
    expect(samItems.some((t) => t.startsWith("Run"))).toBe(false);
    expect(alexItems).toContain("Therapy");
    expect(alexItems.some((t) => t.startsWith("Run"))).toBe(true);
  });

  it("export never contains another profile's private data or PIN hashes", async () => {
    const out = JSON.stringify(await exportForViewer(sam));
    expect(out).not.toContain("very private thought");
    expect(out).not.toContain("Gift ideas");
    expect(out).not.toContain("Therapy");
    expect(out).not.toContain("pinHash");
    expect(out).toContain("Cleaner instructions");
  });

  it("one shared household ledger for both members", async () => {
    await createExpense({ date: today(), amountCents: 5000, merchant: "Market", categoryKey: "groceries", paidByProfileId: alex.profileId }, alex.profileId);
    await createExpense({ date: today(), amountCents: 2550, merchant: "Hardware", categoryKey: "household", paidByProfileId: sam.profileId }, sam.profileId);
    const s = await monthSummary(monthOf(today()));
    expect(s.total).toBe(7550);
    expect(s.rows.find((r) => r.key === "groceries")!.spent).toBe(5000);
  });
});
