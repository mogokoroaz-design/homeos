import { describe, it, expect } from "vitest";
import { buildProjectProposal, refineProposal } from "@/lib/projects/builder";
import { projectDef } from "@/lib/projects/schema";

const summary = (t: string) => { const { proposal } = buildProjectProposal(t); return { name: proposal.name, fields: proposal.fields.map((f) => `${f.label}:${f.type}`) }; };

describe("project builder without AI", () => {
  it.each([
    ["a gratitude journal", "Gratitude Journal", "Three things I'm grateful for:LONG_TEXT"],
    ["I want to track my workouts", "Workout Log", "Duration:DURATION"],
    ["dream journal", "Dream Journal", "Lucid dream:BOOLEAN"],
    ["track my period and symptoms", "Cycle Tracker", "Symptoms:MULTI_SELECT"],
    ["skincare routine tracker", "Skincare Routine Tracker", "Photo:IMAGE"],
    ["book club", "Reading Tracker", "Pages read:NUMBER"],
  ])("%s → %s", (input, name, field) => {
    const s = summary(input);
    expect(s.name).toBe(name);
    expect(s.fields).toContain(field);
    expect(s.fields).not.toContain("Entry:LONG_TEXT");
  });

  it("turns a typed list into typed fields", () => {
    expect(summary("Track my mood, energy level (1-10), hours of sleep, did I exercise, and a note")).toEqual({
      name: "Mood Tracker", fields: ["Mood:RATING", "Energy level:RATING", "Hours of sleep:NUMBER", "Did I exercise?:BOOLEAN", "Note:LONG_TEXT"],
    });
    const energy = buildProjectProposal("Track my mood, energy level (1-10), hours of sleep").proposal.fields[1];
    expect(energy.config).toEqual({ min: 1, max: 10 });
    expect(summary("plant care: which plant, watered?, fertilized?, photo").fields).toEqual(["Plant:SHORT_TEXT", "Watered:BOOLEAN", "Fertilized:BOOLEAN", "Photo:IMAGE"]);
    expect(summary("habit tracker for drinking water, reading and stretching")).toEqual({ name: "Habit Tracker", fields: ["Drinking water:BOOLEAN", "Reading:BOOLEAN", "Stretching:BOOLEAN"] });
    expect(summary("I want to build a project to track my side business — clients, invoices, hours worked and income").fields).toEqual(["Client:SHORT_TEXT", "Invoice sent:BOOLEAN", "Hours:NUMBER", "Income:NUMBER"]);
  });

  it("still gives a usable starting point for anything else", () => {
    const { proposal, notes } = buildProjectProposal("something for my thoughts");
    expect(proposal.fields.length).toBeGreaterThan(1);
    expect(notes.join(" ")).toMatch(/Refine/);
  });

  it("templates with formulas stay valid", () => {
    for (const t of ["running log", "side business tracker"]) expect(() => projectDef.parse(buildProjectProposal(t).proposal)).not.toThrow();
    expect(buildProjectProposal("running log").proposal.fields.map((f) => f.key)).toContain("pace_min_km");
  });
});

describe("refining a proposal in plain words", () => {
  const base = buildProjectProposal("Track my mood, energy level (1-10), hours of sleep, did I exercise, and a note").proposal;
  it("applies add / remove / rename / retype / required / reminder", () => {
    const r = refineProposal(base, "add a photo and minutes walked; remove note; make energy out of 5; rename hours of sleep to Sleep; make mood required; reminder at 9pm; make did I exercise a choice of gym, run, yoga");
    expect(r.notUnderstood).toEqual([]);
    expect(r.proposal.fields.map((f) => `${f.label}:${f.type}${f.required ? "*" : ""}`)).toEqual(["Mood:RATING*", "Energy level:RATING", "Sleep:NUMBER", "Did I exercise?:SINGLE_SELECT", "Photo:IMAGE", "Minutes walked:DURATION"]);
    expect(r.proposal.fields[1].config).toEqual({ min: 1, max: 5 });
    expect(r.proposal.fields[3].config.options).toEqual(["Gym", "Run", "Yoga"]);
    expect(r.proposal.reminder?.time).toBe("21:00");
    expect(r.proposal.fields.map((f) => f.key)).toContain("mood"); // keys of existing fields are kept
  });
  it("reports what it didn't understand and never produces an invalid project", () => {
    const r = refineProposal(base, "frobnicate the widgets");
    expect(r.notUnderstood).toEqual(["frobnicate the widgets"]);
    expect(refineProposal(base, "no reminder").proposal.reminder).toBeNull();
    expect(refineProposal(base, "call it evening check-in").proposal.name).toBe("Evening Check-in");
  });
});
