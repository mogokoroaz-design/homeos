// Rule-based natural-language → project structure. Produces a *proposal* (validated ProjectDef)
// that the user reviews and edits before anything is created. Optional local AI can refine it,
// but its output is validated by the same schema and never executed as code.
import { keyFromLabel, type FieldDef, type ProjectDef, projectDef } from "./schema";
import { titleCase } from "../utils";

interface Rule { re: RegExp; build: (phrase: string) => Omit<FieldDef, "key" | "required"> & { required?: boolean } }

const RULES: Rule[] = [
  { re: /\bhow (i|we) felt\b|\bdescribe\b/i, build: (p) => ({ label: labelFrom(p, "How I felt"), type: "LONG_TEXT", config: {} }) },
  { re: /\b(mood|feel|feeling|felt|emotion|energy|stress|anxiety|happiness|focus|calm|sleep quality|rating|rate)\b/i, build: (p) => ({ label: labelFrom(p, "Mood"), type: "RATING", config: { min: 1, max: 5 } }) },
  { re: /\b(how long|minutes|duration|time spent|length of)\b/i, build: (p) => ({ label: labelFrom(p, "Duration"), type: "DURATION", config: { unit: "min" } }) },
  { re: /\b(pages?|how many|count|number of|steps|reps|distance|weight|amount|hours|glasses|cups|km|miles)\b/i, build: (p) => ({ label: labelFrom(p, "Amount"), type: "NUMBER", config: { min: 0, unit: unitFrom(p) } }) },
  { re: /\b(did i|whether|completed|done|yes\/no|yes or no|checked)\b/i, build: (p) => ({ label: labelFrom(p, "Completed"), type: "BOOLEAN", config: {} }) },
  { re: /\b(tags?|categories|themes|topics)\b/i, build: (p) => ({ label: labelFrom(p, "Tags"), type: "TAGS", config: {} }) },
  { re: /\b(photo|picture|image|screenshot)\b/i, build: (p) => ({ label: labelFrom(p, "Photo"), type: "IMAGE", config: {} }) },
  { re: /\b(checklist|to-?dos?|tasks?|steps to)\b/i, build: (p) => ({ label: labelFrom(p, "Checklist"), type: "CHECKLIST", config: { items: [] } }) },
  { re: /\b(bed ?time|wake ?up time|woke|time of day|start time|end time)\b/i, build: (p) => ({ label: labelFrom(p, "Time"), type: "TIME", config: {} }) },
  { re: /\b(title|name|author|book|course|subject|technique|place|location|trigger|person)\b/i, build: (p) => ({ label: labelFrom(p, "Title"), type: "SHORT_TEXT", config: {} }) },
  { re: /\b(what happened|happened|learn|learned|learnt|grateful|gratitude|thankful|reflection|reflect|thoughts|notes?|describe|journal|summary|insight|lesson|wins?|challenges?|response|cope|coped|handled)\b/i, build: (p) => ({ label: labelFrom(p, "Notes"), type: "LONG_TEXT", config: {} }) },
];

function unitFrom(p: string) {
  const m = p.match(/\b(pages|steps|reps|km|miles|kg|lb|glasses|cups|hours|minutes)\b/i);
  return m ? m[1].toLowerCase() : undefined;
}

const LABEL_MAP: Array<[RegExp, string]> = [
  [/what happened/i, "What happened"], [/what i learn(ed|t)?|learn/i, "What I learned"], [/grateful|gratitude|thankful/i, "Grateful for"],
  [/how i felt|feel|feeling|felt/i, "How I felt"], [/\bmood\b/i, "Mood"], [/pages/i, "Pages read"], [/book|title/i, "Book"],
  [/author/i, "Author"], [/trigger/i, "Trigger"], [/(cope|coped|handled|response)/i, "How I responded"], [/minutes|duration|how long/i, "Minutes"],
];

function labelFrom(phrase: string, fallback: string) {
  for (const [re, label] of LABEL_MAP) if (re.test(phrase)) return label;
  const cleaned = phrase.replace(/^(my|the|a|an|what|how|i|record|track|log|note)\s+/gi, "").replace(/\b(i|my)\b/gi, "").trim();
  return cleaned.length > 2 && cleaned.length < 40 ? titleCase(cleaned) : fallback;
}

const TEMPLATES: Array<{ re: RegExp; name: string; icon: string; fields: Array<Omit<FieldDef, "key"> & { key?: string }>; integration?: ProjectDef["integrations"][number] }> = [
  { re: /meditat/i, name: "Meditation tracker", icon: "flower", fields: [
    { label: "Minutes", type: "DURATION", required: true, config: { unit: "min" } },
    { label: "Type", type: "SINGLE_SELECT", required: false, config: { options: ["Guided", "Breathing", "Body scan", "Silent"] } },
    { label: "Calm after", type: "RATING", required: false, config: { min: 1, max: 5 } },
    { label: "Notes", type: "LONG_TEXT", required: false, config: {} },
  ], integration: { kind: "INSIGHTS_SUMMARY", metric: "entry_count", label: "Meditation sessions" } },
  { re: /reading|books?\b/i, name: "Reading tracker", icon: "book", fields: [
    { label: "Book", type: "SHORT_TEXT", required: true, config: {} },
    { label: "Pages read", type: "NUMBER", required: false, config: { min: 0, unit: "pages" } },
    { label: "Minutes", type: "DURATION", required: false, config: { unit: "min" } },
    { label: "Thoughts", type: "LONG_TEXT", required: false, config: {} },
  ], integration: { kind: "INSIGHTS_SUMMARY", metric: "field_sum", fieldKey: "pages_read", label: "Pages read" } },
  { re: /emotional regulation|emotion/i, name: "Emotional regulation journal", icon: "heart", fields: [
    { label: "Situation", type: "LONG_TEXT", required: true, config: {} },
    { label: "Emotion", type: "MULTI_SELECT", required: false, config: { options: ["Anger", "Anxiety", "Sadness", "Frustration", "Overwhelm", "Joy", "Calm"] } },
    { label: "Intensity", type: "RATING", required: false, config: { min: 1, max: 10 } },
    { label: "How I responded", type: "LONG_TEXT", required: false, config: {} },
    { label: "What helped", type: "LONG_TEXT", required: false, config: {} },
  ] },
  { re: /learning|course|study|studying/i, name: "Learning tracker", icon: "graduation", fields: [
    { label: "Topic", type: "SHORT_TEXT", required: true, config: {} },
    { label: "Minutes", type: "DURATION", required: false, config: { unit: "min" } },
    { label: "What I learned", type: "LONG_TEXT", required: false, config: {} },
    { label: "Confidence", type: "RATING", required: false, config: { min: 1, max: 5 } },
  ], integration: { kind: "INSIGHTS_SUMMARY", metric: "field_sum", fieldKey: "minutes", label: "Learning minutes" } },
];

function splitPhrases(text: string) {
  const m = text.match(/(?:record|track|log|capture|write down|note|include|with fields?|fields? for|where i can)\s+(?:my\s+|down\s+)?(.*)$/is);
  const list = (m ? m[1] : text).replace(/\.$/, "");
  return list.split(/,|;|\band\b|\balso\b/i).map((s) => s.trim()).filter((s) => s.length > 1 && s.length < 80);
}

function projectName(text: string) {
  const m = text.match(/(?:create|make|build|start|set up|want)\s+(?:a|an|my)?\s*((?:[a-z]+\s){0,3}(?:journal|tracker|log|diary|plan|planner|goals?|habit tracker))/i);
  return m ? titleCase(m[1].trim()) : "My project";
}

export function buildProjectProposal(description: string): { proposal: ProjectDef; notes: string[] } {
  const notes: string[] = [];
  const template = TEMPLATES.find((t) => t.re.test(description));
  const fields: FieldDef[] = [];
  const add = (f: Omit<FieldDef, "key"> & { key?: string }) => {
    let key = f.key ?? keyFromLabel(f.label);
    let n = 2;
    while (fields.some((x) => x.key === key)) key = `${keyFromLabel(f.label)}_${n++}`;
    if (fields.some((x) => x.label.toLowerCase() === f.label.toLowerCase())) return;
    fields.push({ ...f, key, required: f.required ?? false, config: f.config ?? {} });
  };
  const phrases = splitPhrases(description);
  const explicit = /record|track|log|capture|where i can|include|fields?/i.test(description) && phrases.length > 1;
  if (explicit) {
    for (const p of phrases) {
      const rule = RULES.find((r) => r.re.test(p));
      if (rule) add({ ...rule.build(p), required: false });
      else add({ label: labelFrom(p, titleCase(p)), type: "LONG_TEXT", required: false, config: {} });
    }
    notes.push("Fields were inferred from your description — adjust types and labels before creating.");
  } else if (template) {
    template.fields.forEach(add);
    notes.push(`Started from the ${template.name.toLowerCase()} template.`);
  }
  if (!fields.length) {
    add({ label: "Entry", type: "LONG_TEXT", required: true, config: {} });
    notes.push("Couldn't infer specific fields — added a free-text entry field. Add more below.");
  }
  const daily = /\b(daily|every day|each day|nightly|every night|each evening)\b/i.test(description);
  const name = template && !explicit ? template.name : projectName(description);
  const proposal = projectDef.parse({
    name,
    description: description.slice(0, 500),
    icon: template?.icon ?? (/journal|diary/i.test(description) ? "notebook" : "target"),
    fields,
    reminder: daily ? { time: "21:00", weekdays: "0,1,2,3,4,5,6", message: `Time for your ${name.toLowerCase()}` } : null,
    integrations: template?.integration && fields.some((f) => !template.integration!.fieldKey || f.key === template.integration!.fieldKey) ? [template.integration] : [],
  });
  if (daily) notes.push("A private daily 9 pm reminder is proposed — remove it if you don't want one.");
  if (proposal.integrations.length) notes.push("A summary metric for Insights is proposed. Only the count/total is shared — never entry text — and only after you approve it.");
  return { proposal, notes };
}
