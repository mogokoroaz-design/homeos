// Natural-language → project structure, without any AI service.
// Produces a *proposal* (a validated ProjectDef) that the person reviews, refines in plain words
// ("add a photo", "make energy 1-10") and approves. Optional local AI can improve proposals, but
// everything is validated by the same schema and nothing is ever executed as code.
import { keyFromLabel, type FieldDef, type ProjectDef, projectDef } from "./schema";
import { titleCase, singular } from "../utils";

type F = Omit<FieldDef, "key" | "required"> & { key?: string; required?: boolean };
const f = (label: string, type: FieldDef["type"], config: FieldDef["config"] = {}, required = false, key?: string): F => ({ label, type, config, required, ...(key ? { key } : {}) });
const rating = (label: string, max = 5, required = false) => f(label, "RATING", { min: 1, max }, required);
const yesNo = (label: string) => f(label, "BOOLEAN");
const text = (label: string, required = false) => f(label, "SHORT_TEXT", {}, required);
const long = (label: string, required = false) => f(label, "LONG_TEXT", {}, required);
const num = (label: string, unit?: string, extra: FieldDef["config"] = {}) => f(label, "NUMBER", { min: 0, ...(unit ? { unit } : {}), ...extra });
const choice = (label: string, options: string[], multi = false) => f(label, multi ? "MULTI_SELECT" : "SINGLE_SELECT", { options });

interface Template {
  id: string;
  re: RegExp;
  name: string;
  icon: string;
  fields: F[];
  integration?: ProjectDef["integrations"][number];
  reminder?: { time: string; weekdays: string };
  note?: string;
  extras?: string[]; // fields to add when this topic is only mentioned as context ("…to regulate emotions")
}

// Order matters: more specific templates first.
const TEMPLATES: Template[] = [
  { id: "meditation", re: /meditat|mindful/i, name: "Meditation tracker", icon: "flower", fields: [
    f("Minutes", "DURATION", { unit: "min" }, true), choice("Type", ["Guided", "Breathing", "Body scan", "Silent"]), rating("Calm after"), long("Notes"),
  ], integration: { kind: "INSIGHTS_SUMMARY", metric: "entry_count", label: "Meditation sessions" } },
  { id: "thought", re: /\bcbt\b|thought record|negative thoughts?|therapy|cognitive/i, name: "Thought record", icon: "brain", fields: [
    long("Situation", true), long("Automatic thought"), rating("Emotion intensity", 10), long("Evidence for"), long("Evidence against"), long("Balanced thought"), rating("Intensity after", 10),
  ] },
  { id: "emotion", re: /emotional regulation|regulat\w* (my |our )?emotions?|manag\w* (my )?emotions?|emotions? journal/i, name: "Emotional regulation journal", icon: "heart", extras: ["Emotion", "Intensity", "What helped"], fields: [
    long("Situation", true), choice("Emotion", ["Anger", "Anxiety", "Sadness", "Frustration", "Overwhelm", "Joy", "Calm"], true), rating("Intensity", 10), long("How I responded"), long("What helped"),
  ] },
  { id: "gratitude", re: /gratitude|grateful|thankful/i, name: "Gratitude journal", icon: "heart", fields: [
    long("Three things I'm grateful for", true), long("Best moment of the day"), rating("Mood"),
  ], reminder: { time: "21:00", weekdays: "0,1,2,3,4,5,6" } },
  { id: "dream", re: /dream/i, name: "Dream journal", icon: "moon", fields: [
    long("What I dreamt", true), rating("Vividness"), f("Emotions", "TAGS"), yesNo("Lucid dream"), f("Recurring themes", "TAGS"),
  ], reminder: { time: "07:30", weekdays: "0,1,2,3,4,5,6" } },
  { id: "cycle", re: /period|menstrua|\bcycle\b|\bpms\b|ovulat/i, name: "Cycle tracker", icon: "calendar", fields: [
    choice("Flow", ["None", "Spotting", "Light", "Medium", "Heavy"]), choice("Symptoms", ["Cramps", "Bloating", "Headache", "Fatigue", "Acne", "Mood swings", "Back pain", "Tender breasts", "Cravings"], true), rating("Mood"), rating("Energy"), long("Notes"),
  ] },
  { id: "symptom", re: /symptom|migraine|headache|allerg|flare|chronic pain|\bpain\b/i, name: "Symptom diary", icon: "activity", fields: [
    text("Symptom", true), rating("Severity", 10), f("Duration", "DURATION", { unit: "min" }), f("Possible triggers", "TAGS"), text("Medication taken"), long("Notes"),
  ] },
  { id: "medication", re: /medicat|\bpills?\b|supplement|vitamin|\bmeds\b/i, name: "Medication log", icon: "pill", fields: [
    text("Medication", true), text("Dose"), yesNo("Taken"), f("Time taken", "TIME"), long("Side effects"),
  ], reminder: { time: "09:00", weekdays: "0,1,2,3,4,5,6" } },
  { id: "skincare", re: /skin ?care|\bskin\b/i, name: "Skincare routine", icon: "sparkles", fields: [
    choice("Routine", ["Morning", "Evening"]), f("Steps done", "CHECKLIST", { items: ["Cleanser", "Toner", "Serum", "Moisturiser", "SPF"] }), f("Products used", "TAGS"), rating("Skin condition"), f("Photo", "IMAGE"), long("Notes"),
  ] },
  { id: "running", re: /\brun(s|ning)?\b|\bjog/i, name: "Running log", icon: "activity", fields: [
    num("Distance", "km", {}), f("Duration", "DURATION", { unit: "min" }), f("Pace (min/km)", "FORMULA", { expression: "round(duration / distance, 2)" }), rating("Effort", 10), text("Route"), long("Notes"),
  ], integration: { kind: "INSIGHTS_SUMMARY", metric: "field_sum", fieldKey: "distance", label: "Running km" }, note: "Runs from your Apple Watch can also come in through the Apple Health import on your People page." },
  { id: "workout", re: /workout|exercis|\bgym\b|training|lifting|strength|fitness/i, name: "Workout log", icon: "dumbbell", fields: [
    choice("Workout type", ["Strength", "Cardio", "HIIT", "Yoga", "Run", "Walk", "Sport", "Other"]), f("Duration", "DURATION", { unit: "min" }), rating("Effort", 10), f("Exercises", "CHECKLIST", { items: [] }), long("Notes"),
  ], integration: { kind: "INSIGHTS_SUMMARY", metric: "field_sum", fieldKey: "duration", label: "Workout minutes" }, note: "Tip: workouts from Apple Health/Fitness also appear automatically on your People page." },
  { id: "sleep", re: /sleep|insomnia|bedtime/i, name: "Sleep diary", icon: "moon", fields: [
    f("Bedtime", "TIME"), f("Wake time", "TIME"), num("Hours slept", "h"), rating("Sleep quality"), yesNo("Caffeine after 2pm"), long("Notes"),
  ], reminder: { time: "08:00", weekdays: "0,1,2,3,4,5,6" } },
  { id: "water", re: /water intake|hydrat|drink(ing)? (more )?water/i, name: "Water tracker", icon: "droplet", fields: [num("Glasses", "glasses"), yesNo("Goal met")] },
  { id: "mood", re: /\bmood|feelings?\b|anxiety|mental health|wellbeing|well-being/i, name: "Mood tracker", icon: "smile", fields: [
    rating("Mood", 5, true), rating("Energy"), rating("Anxiety"), choice("Emotions", ["Happy", "Calm", "Sad", "Anxious", "Angry", "Tired", "Excited", "Stressed"], true), long("What influenced it"),
  ], reminder: { time: "20:00", weekdays: "0,1,2,3,4,5,6" } },
  { id: "review", re: /weekly review|week in review|reflection|retro|monthly review/i, name: "Weekly review", icon: "calendar", fields: [
    long("Wins"), long("Challenges"), long("Lessons"), f("Next week's priorities", "CHECKLIST", { items: [] }), rating("Week rating", 10),
  ], reminder: { time: "18:00", weekdays: "0" } },
  { id: "goals", re: /\bgoals?\b|\bokrs?\b|resolution/i, name: "Goal tracker", icon: "target", fields: [
    text("Goal", true), num("Progress", "%", { max: 100 }), long("Steps taken"), long("Blockers"), rating("Confidence"),
  ] },
  { id: "business", re: /business|freelanc|client|invoice|side hustle|consult/i, name: "Side business log", icon: "briefcase", fields: [
    text("Client"), long("Work done"), num("Hours", "h"), num("Income", "$"), yesNo("Invoice sent"), yesNo("Paid"), f("Hourly rate", "FORMULA", { expression: "round(income / hours, 2)" }),
  ], integration: { kind: "INSIGHTS_SUMMARY", metric: "field_sum", fieldKey: "income", label: "Side business income" } },
  { id: "savings", re: /saving|no[- ]spend|spending|budget|money/i, name: "Savings tracker", icon: "wallet", fields: [
    num("Amount saved", "$"), choice("Category", ["Groceries", "Eating out", "Shopping", "Transport", "Other"]), yesNo("No-spend day"), long("Notes"),
  ], note: "Household spending is already tracked in Money — this project is for your personal goals." },
  { id: "plant", re: /plant|garden|houseplant|succulent/i, name: "Plant care log", icon: "leaf", fields: [
    text("Plant", true), yesNo("Watered"), yesNo("Fertilised"), rating("Health"), f("Photo", "IMAGE"), long("Notes"),
  ] },
  { id: "pet", re: /\bpets?\b|\bdog\b|\bcat\b|puppy|kitten/i, name: "Pet care log", icon: "heart", fields: [
    text("Pet"), yesNo("Fed"), f("Walk", "DURATION", { unit: "min" }), yesNo("Medication given"), num("Weight", "kg"), long("Notes"),
  ] },
  { id: "baby", re: /\bbaby\b|newborn|infant|breastfe|bottle feed|nappy|diaper/i, name: "Baby log", icon: "heart", fields: [
    choice("Type", ["Feed", "Nap", "Diaper"]), f("Time", "TIME"), f("Duration", "DURATION", { unit: "min" }), num("Amount", "ml"), long("Notes"),
  ] },
  { id: "practice", re: /piano|guitar|violin|cello|drum|instrument|singing|vocal|music practice/i, name: "Practice log", icon: "music", fields: [
    text("Instrument"), f("Minutes", "DURATION", { unit: "min" }, true), f("Pieces practised", "TAGS"), choice("Focus", ["Technique", "Repertoire", "Theory", "Improvisation"]), rating("Quality"), long("Notes"),
  ], integration: { kind: "INSIGHTS_SUMMARY", metric: "field_sum", fieldKey: "minutes", label: "Practice minutes" } },
  { id: "study", re: /stud(y|ying)|exam|revision|homework|assignment/i, name: "Study log", icon: "graduation", fields: [
    text("Subject", true), f("Minutes", "DURATION", { unit: "min" }), f("Topics", "TAGS"), rating("Focus"), num("Pomodoros"), long("What I learned"),
  ], integration: { kind: "INSIGHTS_SUMMARY", metric: "field_sum", fieldKey: "minutes", label: "Study minutes" } },
  { id: "learning", re: /learn|language|spanish|french|german|italian|japanese|mandarin|hindi|duolingo|course/i, name: "Learning tracker", icon: "graduation", fields: [
    text("Topic", true), f("Minutes", "DURATION", { unit: "min" }), long("What I learned"), rating("Confidence"),
  ], integration: { kind: "INSIGHTS_SUMMARY", metric: "field_sum", fieldKey: "minutes", label: "Learning minutes" } },
  { id: "jobs", re: /\bjobs?\b|application|interview|career|job hunt/i, name: "Job applications", icon: "briefcase", fields: [
    text("Company", true), text("Role"), choice("Status", ["Applied", "Phone screen", "Interview", "Offer", "Rejected", "Withdrawn"]), f("Date applied", "DATE"), text("Link"), long("Notes"),
  ] },
  { id: "travel", re: /travel|\btrip\b|vacation|holiday/i, name: "Travel journal", icon: "map", fields: [
    text("Place", true), long("Highlights"), f("Photo", "IMAGE"), num("Spent", "$"), rating("Rating"),
  ] },
  { id: "body", re: /weight loss|lose weight|body measure|progress photo/i, name: "Body progress", icon: "activity", fields: [
    num("Weight", "kg"), num("Waist", "cm"), f("Photo", "IMAGE"), long("Notes"),
  ], note: "Weight from Apple Health is also synced to your People page." },
  { id: "screen", re: /screen time|phone use|social media|doomscroll/i, name: "Screen time log", icon: "phone", fields: [
    num("Screen time", "h"), f("Social media", "DURATION", { unit: "min" }), num("Pickups"), yesNo("Goal met"),
  ] },
  { id: "spiritual", re: /\bpray|bible|scripture|spiritual|quran|devotion|gita/i, name: "Spiritual practice", icon: "sun", fields: [
    choice("Practice", ["Prayer", "Reading", "Reflection", "Service"]), f("Minutes", "DURATION", { unit: "min" }), text("Passage or topic"), long("Reflection"),
  ] },
  { id: "cooking", re: /recipe test|cooking (practice|journal)|baking (log|journal)/i, name: "Cooking journal", icon: "chef", fields: [
    text("Dish", true), text("Recipe link"), rating("How it turned out"), long("What to change next time"), f("Photo", "IMAGE"),
  ] },
  { id: "reading", re: /reading|\bbooks?\b|book club/i, name: "Reading tracker", icon: "book", fields: [
    text("Book", true), num("Pages read", "pages"), f("Minutes", "DURATION", { unit: "min" }), long("Thoughts"),
  ], integration: { kind: "INSIGHTS_SUMMARY", metric: "field_sum", fieldKey: "pages_read", label: "Pages read" } },
  { id: "habits", re: /habit/i, name: "Habit tracker", icon: "check", fields: [yesNo("Exercise"), yesNo("Read"), yesNo("Drink 2 L water"), yesNo("No phone in bed")], reminder: { time: "21:00", weekdays: "0,1,2,3,4,5,6" } },
  { id: "journal", re: /journal|diary/i, name: "Daily journal", icon: "notebook", fields: [
    rating("Mood"), long("What happened"), text("Highlight of the day"), long("What I learned"), long("Grateful for"),
  ], reminder: { time: "21:00", weekdays: "0,1,2,3,4,5,6" } },
];

// ── Phrase → field inference ──

const LABEL_MAP: Array<[RegExp, string]> = [
  [/what happened/i, "What happened"], [/what i learn(ed|t)?/i, "What I learned"], [/grateful|gratitude|thankful/i, "Grateful for"],
  [/how i felt/i, "How I felt"], [/^(my )?mood$/i, "Mood"], [/pages/i, "Pages read"], [/(cope|coped|handled|responded)/i, "How I responded"],
];

function sentenceCase(s: string) {
  const t = s.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

export function cleanLabel(phrase: string) {
  for (const [re, label] of LABEL_MAP) if (re.test(phrase)) return label;
  let p = phrase.replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim();
  p = p.replace(/^(and|also|plus|then|to|record|track|log|note|write down|capture|keep track of|my|the|a|an|some|any)\s+/gi, "");
  p = p.replace(/^(and|also|plus|my|the|a|an)\s+/gi, "").replace(/[.!,;:]+$/, "").trim();
  return sentenceCase(p).slice(0, 80) || "Note";
}

/** Infers one field from a phrase like "energy level (1-10)", "did I exercise?", "photo", "income". */
export function phraseToField(phrase: string, template?: Template): F {
  const raw = phrase.trim();
  const p = raw.toLowerCase();
  // Reuse a matching field from the active template (keeps its type and options).
  // Reuse only on a strong match: all of the field's words appear in the phrase, or vice versa.
  if (template) {
    const norm = (x: string) => x.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map(singular);
    const pw = norm(p);
    const looksYesNo = /\?\s*$/.test(raw) || /^(did|have|has|was|were|is|am|do|does)\s/.test(p);
    const hit = template.fields.find((tf) => {
      const lw = norm(tf.label);
      if (!lw.length || !pw.length) return false;
      if (looksYesNo && tf.type !== "BOOLEAN") return false;
      return lw.every((w) => pw.includes(w)) || pw.every((w) => lw.includes(w));
    });
    if (hit) return hit;
  }
  const label = cleanLabel(raw);
  const range = p.match(/\(?\s*(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*\)?/) ?? p.match(/out of (\d{1,2})|\/\s*(10|5)\b/);
  if (/how i felt|describe|reflect|what happened|thoughts|story|journal entry/.test(p)) return long(label);
  if (range && /(rate|rating|level|score|mood|energy|stress|pain|quality|anxiety|focus|intensity|feel|\(|out of|\/)/.test(p)) {
    const [min, max] = range[2] !== undefined && range[1] !== undefined && !/out of|\//.test(range[0]) ? [Number(range[1]), Number(range[2])] : [1, Number(range[1] ?? range[2])];
    return f(label, "RATING", { min: Math.max(0, min), max: Math.max(min + 1, max) });
  }
  if (/\?\s*$/.test(raw) || /^(did|have|has|was|were|is|am|do|does)\s/.test(p) || /\b(watered|fertili[sz]ed|taken|done|completed|yes\/no|yes or no)\b/.test(p)) return yesNo(sentenceCase(label.replace(/\?$/, "")) + (/^(did|have|was|is|do)\s/i.test(label) ? "?" : ""));
  if (/\b(mood|energy|stress|anxiety|happiness|motivation|focus|confidence|satisfaction|quality|rating|rate)\b/.test(p)) return rating(label);
  if (/photo|picture|image|selfie|screenshot/.test(p)) return f(label, "IMAGE");
  if (/\b(income|revenue|cost|spent|spend|price|amount|earn|earned|salary|saved|savings|paid|\$)/.test(p)) return num(label, "$");
  if (/\b(minutes?|mins|duration|how long|time spent)\b/.test(p)) return f(label, "DURATION", { unit: "min" });
  if (/\b(hours?|hrs)\b/.test(p)) return num(label, "h");
  const unit = p.match(/\b(pages|steps|reps|sets|km|miles|kg|lbs|glasses|cups|calories|kcal|words|laps)\b/);
  if (unit || /\b(how many|number of|count|weight|distance|score)\b/.test(p)) return num(label, unit?.[1]);
  if (/\b(bedtime|wake ?up|woke|what time|start time|end time|time of)\b/.test(p)) return f(label, "TIME");
  if (/\b(date|deadline|due)\b/.test(p)) return f(label, "DATE");
  if (/\b(priorit|to-?dos?|tasks|checklist|steps to)/.test(p)) return f(label, "CHECKLIST", { items: [] });
  if (/\b(tags?|categories|themes|topics|symptoms|emotions|triggers|ingredients|exercises|people|places)\b/.test(p)) return f(label, "TAGS");
  if (/\b(which|who|where|name|title|author|book|plant|client|company|role|place|location|subject|topic|dish|song|piece|link|url|brand|product)\b/.test(p) && label.split(" ").length <= 4) return text(label);
  if (/^(no|not|avoid)\s/.test(p) && label.split(" ").length <= 4) return yesNo(label);
  return long(label);
}

// ── Naming & list detection ──

const STOP = new Set(["a", "an", "my", "the", "to", "want", "create", "make", "build", "start", "i", "new", "simple", "personal", "of", "for", "me", "our", "some", "like", "would", "need", "set", "up"]);

function projectName(textIn: string, template?: Template) {
  const t = textIn.replace(/[—–:]/g, " ");
  const m = t.match(/((?:[A-Za-z'-]+\s+){0,3})(journal|tracker|log|diary|planner|plan|review|routine|challenge|record)\b/i);
  if (m) {
    const words = m[1].trim().split(/\s+/).filter(Boolean);
    const kept: string[] = [];
    for (let i = words.length - 1; i >= 0; i--) { if (STOP.has(words[i].toLowerCase())) break; kept.unshift(words[i]); }
    if (kept.length) return titleCase(`${kept.join(" ")} ${m[2]}`);
    if (template) return titleCase(template.name);
    return titleCase(m[2]);
  }
  if (template) return titleCase(template.name);
  const tr = textIn.match(/track(?:ing)?\s+(?:of\s+)?(?:my |our |the )?([a-z' ]{3,30}?)(?:\s+(?:and|with|including|where|so)\b|[,.:—-]|$)/i);
  if (tr) return titleCase(`${tr[1].trim()} tracker`);
  const colon = textIn.match(/^([^:]{3,40}):/);
  if (colon) return titleCase(colon[1].trim());
  return titleCase(textIn.split(/\s+/).filter((w) => !STOP.has(w.toLowerCase())).slice(0, 3).join(" ")) || "My project";
}

/** Returns the comma/“and” list the person typed (≥ 2 items), or [] if there isn't one. */
function listPhrases(textIn: string) {
  const t = textIn.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  const markers = [...t.matchAll(/(?::|\b(?:record|track|log|capture|note down|write down|include|including|with fields? for|fields? for|where i can|with|for)\b)/gi)];
  for (const m of markers) {
    let rest = t.slice((m.index ?? 0) + m[0].length);
    const dash = rest.match(/^[^,]*?[—–:]\s*(.*)$/);
    if (dash && dash[1].includes(",")) rest = dash[1];
    const parts = rest.split(/,|;|\band\b|\balso\b|\bplus\b|\n/i).map((s) => s.trim()).filter((s) => s.length > 1 && s.length < 80);
    if (parts.length >= 2) return parts;
  }
  return [];
}

function uniqueKey(label: string, taken: Set<string>, preferred?: string) {
  const base = preferred ?? keyFromLabel(label);
  let key = base, n = 2;
  while (taken.has(key)) key = `${base}_${n++}`.slice(0, 40);
  taken.add(key);
  return key;
}

function toDefs(fields: F[]): FieldDef[] {
  const taken = new Set<string>();
  const labels = new Set<string>();
  const out: FieldDef[] = [];
  for (const x of fields) {
    if (labels.has(x.label.toLowerCase())) continue;
    labels.add(x.label.toLowerCase());
    out.push({ key: uniqueKey(x.label, taken, x.key), label: x.label, type: x.type, required: x.required ?? false, config: x.config ?? {} });
  }
  // Formulas reference template keys; drop any whose inputs are missing.
  return out.filter((d) => d.type !== "FORMULA" || (d.config.expression ?? "").match(/[a-z_]+/g)!.filter((w) => !["round", "min", "max", "abs"].includes(w)).every((w) => out.some((o) => o.key === w)));
}

export function findTemplate(description: string) {
  return TEMPLATES.find((t) => t.re.test(description));
}

export function buildProjectProposal(description: string): { proposal: ProjectDef; notes: string[] } {
  const notes: string[] = [];
  // The sentence holding the list defines the fields; other sentences are context ("…to regulate emotions").
  const sentences = description.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  const listSentence = sentences.find((x) => listPhrases(x).length >= 2) ?? description;
  const context = sentences.filter((x) => x !== listSentence).join(" ");
  const list = listPhrases(listSentence);
  // Choose the template from what is being made ("a daily journal where…"), not from words inside the list.
  const head = list.length ? description.slice(0, Math.max(0, description.toLowerCase().indexOf(list[0].toLowerCase()))) : description;
  const template = findTemplate(head) ?? (list.length >= 3 ? undefined : findTemplate(description));
  const isHabit = /habit/i.test(description);
  let fields: F[];
  if (isHabit && list.length) {
    fields = list.map((p) => yesNo(cleanLabel(p)));
    notes.push("Each habit becomes a yes/no you tick every day.");
  } else if (list.length >= 3 || (list.length >= 2 && !template)) {
    fields = list.map((p) => phraseToField(p, template));
    notes.push("Fields were taken from your list — check the types and labels below.");
  } else if (template) {
    fields = [...template.fields];
    for (const p of list) {
      if (template.re.test(p)) continue; // "period" in a cycle tracker is the topic, not a field
      const x = phraseToField(p, template);
      if (!fields.includes(x)) fields.push(x);
    }
    notes.push(`Started from the ${template.name.toLowerCase()} template.`);
  } else {
    fields = [long("Entry", true), rating("How it went"), f("Tags", "TAGS")];
    notes.push("I couldn't tell what to track, so this is a simple starting point. Use Refine below, e.g. “add minutes, a photo and a rating out of 10”.");
  }
  if (template?.note) notes.push(template.note);
  // Topics mentioned as context add their key fields.
  const extraTemplate = context ? TEMPLATES.find((t) => t.re.test(context) && t !== template) : undefined;
  if (extraTemplate) {
    const have = new Set(fields.map((x) => x.label.toLowerCase()));
    const pick = (extraTemplate.extras ?? extraTemplate.fields.filter((x) => x.type !== "LONG_TEXT").map((x) => x.label)).slice(0, 3);
    const added = extraTemplate.fields.filter((x) => pick.includes(x.label) && !have.has(x.label.toLowerCase()));
    if (added.length) {
      fields = [...fields, ...added];
      notes.push(`Added ${added.map((x) => `“${x.label}”`).join(", ")} because you mentioned ${extraTemplate.name.toLowerCase().replace(/ (journal|tracker|log)$/, "")}.`);
    }
  }
  const headWords = head.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w) && !/^(track|tracking|record|log|keep|project|where|can|that|which|with|for|and)$/.test(w));
  const name = list.length >= 3 && !headWords.length && !template ? titleCase(`${cleanLabel(list[0])} tracker`) : projectName(list.length >= 3 && head.trim() ? head : description, template);
  const daily = /\b(daily|every day|each day|nightly|every night|each evening|every morning)\b/i.test(description);
  const reminder = template?.reminder && (daily || !list.length) ? { ...template.reminder, message: `Time for your ${name.toLowerCase()}` } : daily ? { time: "21:00", weekdays: "0,1,2,3,4,5,6", message: `Time for your ${name.toLowerCase()}` } : null;
  const defs = toDefs(fields);
  const integrations = template?.integration && defs.some((d) => !template.integration!.fieldKey || d.key === template.integration!.fieldKey) ? [template.integration] : [];
  const proposal = projectDef.parse({ name, description: description.slice(0, 500), icon: template?.icon ?? "notebook", fields: defs, reminder, integrations });
  if (reminder) notes.push(`A private reminder at ${reminder.time} is proposed — remove it if you don't want one.`);
  if (integrations.length) notes.push("A summary number for Insights is proposed. Only the total is shared — never entry text — and only after you approve it on the project page.");
  return { proposal, notes };
}

// ── Plain-language refinement: "add a photo", "remove notes", "make energy 1-10" ──

const TYPE_WORDS: Array<[RegExp, FieldDef["type"]]> = [
  [/^(rating|stars?|scale)$/, "RATING"], [/^(number|numeric|amount|count)$/, "NUMBER"], [/^(yes\/no|yes or no|boolean|checkbox|tick( box)?|toggle)$/, "BOOLEAN"],
  [/^(short text|text|single line)$/, "SHORT_TEXT"], [/^(long text|paragraph|note|notes|free text)$/, "LONG_TEXT"], [/^date$/, "DATE"], [/^time$/, "TIME"],
  [/^(duration|minutes|timer)$/, "DURATION"], [/^(photo|image|picture)$/, "IMAGE"], [/^tags?$/, "TAGS"], [/^(checklist|to-?do list|list)$/, "CHECKLIST"],
  [/^(choice|single choice|dropdown|options?|select)$/, "SINGLE_SELECT"], [/^(multiple choice|multi(ple)? select|multi-select)$/, "MULTI_SELECT"],
];

const TYPE_ALTERNATION = "multiple choice|multi(?:ple)? select|multi-select|single choice|choice|dropdown|options?|select|yes\\/no|yes or no|boolean|checkbox|tick box|tick|toggle|short text|long text|single line|paragraph|free text|notes?|text|rating|stars?|scale|number|numeric|amount|count|date|time|duration|minutes|timer|photo|image|picture|tags?|checklist|to-?do list|list";

function findField(def: ProjectDef, target: string) {
  const words = target.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !["the", "a", "an", "field", "my"].includes(w)).map((w) => w.replace(/s$/, ""));
  let best: { i: number; score: number } | null = null;
  def.fields.forEach((fd, i) => {
    const lw = fd.label.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).map((w) => w.replace(/s$/, ""));
    const score = words.filter((w) => lw.includes(w) || fd.key.includes(w)).length;
    if (score && (!best || score > best.score)) best = { i, score };
  });
  return best ? (best as { i: number }).i : -1;
}

export function refineProposal(input: ProjectDef, instruction: string): { proposal: ProjectDef; changes: string[]; notUnderstood: string[] } {
  const def: ProjectDef = JSON.parse(JSON.stringify(input));
  const changes: string[] = [];
  const notUnderstood: string[] = [];
  const template = findTemplate(`${def.name} ${def.description}`);
  const taken = new Set(def.fields.map((x) => x.key));
  const parts = instruction.split(/\n|;|\.\s+|\bthen\b/i).map((s) => s.trim().replace(/\.$/, "")).filter(Boolean);
  for (const part of parts) {
    const p = part.toLowerCase();
    let m: RegExpMatchArray | null;
    if ((m = p.match(/^(?:no|remove|delete|drop|turn off)\s+(?:the\s+)?(?:daily\s+)?reminders?$/))) { def.reminder = null; changes.push("Removed the reminder"); continue; }
    if ((m = p.match(/reminder (?:at|for) (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/))) {
      let h = Number(m[1]) % 24; if (m[3] === "pm" && h < 12) h += 12; if (m[3] === "am" && h === 12) h = 0;
      const time = `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`;
      def.reminder = { time, weekdays: def.reminder?.weekdays ?? "0,1,2,3,4,5,6", message: def.reminder?.message ?? `Time for your ${def.name.toLowerCase()}` };
      changes.push(`Reminder at ${time}`); continue;
    }
    if ((m = part.match(/^(?:call it|name it|rename (?:the )?project to|project name:?)\s+["“]?(.+?)["”]?$/i))) { def.name = titleCase(m[1]).slice(0, 80); changes.push(`Renamed the project to “${def.name}”`); continue; }
    if ((m = part.match(/^rename\s+(.+?)\s+(?:to|as)\s+["“]?(.+?)["”]?$/i))) {
      const i = findField(def, m[1]);
      if (i >= 0) { const old = def.fields[i].label; def.fields[i].label = sentenceCase(m[2]).slice(0, 80); changes.push(`Renamed “${old}” to “${def.fields[i].label}”`); } else notUnderstood.push(part);
      continue;
    }
    if ((m = p.match(/^(?:remove|delete|drop|get rid of|no)\s+(?:the\s+)?(.+?)(?:\s+field)?$/))) {
      for (const t of m[1].split(/,|\band\b/).map((s) => s.trim()).filter(Boolean)) {
        const i = findField(def, t);
        if (i >= 0 && def.fields.length > 1) { changes.push(`Removed “${def.fields[i].label}”`); taken.delete(def.fields[i].key); def.fields.splice(i, 1); } else notUnderstood.push(`remove ${t}`);
      }
      continue;
    }
    if ((m = p.match(/^make\s+(.+?)\s+(required|optional|mandatory)$/))) {
      const i = findField(def, m[1]);
      if (i >= 0) { def.fields[i].required = m[2] !== "optional"; changes.push(`“${def.fields[i].label}” is now ${def.fields[i].required ? "required" : "optional"}`); } else notUnderstood.push(part);
      continue;
    }
    if ((m = p.match(/^make\s+(.+?)\s+(?:a\s+|an\s+)?(?:(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})|out of\s+(\d{1,2}))(?:\s+(?:rating|scale))?$/))) {
      const i = findField(def, m[1]);
      if (i >= 0) {
        const min = m[4] ? 1 : Number(m[2]), max = Number(m[4] ?? m[3]);
        def.fields[i] = { ...def.fields[i], type: "RATING", config: { min, max } };
        changes.push(`“${def.fields[i].label}” is now a ${min}–${max} rating`);
      } else notUnderstood.push(part);
      continue;
    }
    if ((m = p.match(new RegExp(`^make\\s+(.+)\\s+(?:into\\s+)?(?:a\\s+|an\\s+)?(${TYPE_ALTERNATION})(?:\\s+(?:of|with|from)\\s+(.+))?$`)))) {
      const tw = TYPE_WORDS.find(([re]) => re.test(m![2].trim()));
      const i = findField(def, m[1]);
      if (tw && i >= 0) {
        const type = tw[1];
        const options = m[3]?.split(/,|\bor\b|\band\b/).map((s) => sentenceCase(s.trim())).filter(Boolean);
        const config: FieldDef["config"] = type === "RATING" ? { min: 1, max: 5 } : (type === "SINGLE_SELECT" || type === "MULTI_SELECT") ? { options: options?.length ? options : ["Option 1", "Option 2"] } : type === "CHECKLIST" ? { items: options ?? [] } : {};
        def.fields[i] = { ...def.fields[i], type, config };
        changes.push(`“${def.fields[i].label}” is now ${type.toLowerCase().replace("_", " ")}${options?.length && (type === "SINGLE_SELECT" || type === "MULTI_SELECT") ? ` (${options.join(", ")})` : ""}`);
      } else notUnderstood.push(part);
      continue;
    }
    if ((m = part.match(/^(?:add|include|also track|track|plus|and|i also want|also)\s+(.+)$/i))) {
      for (const item of m[1].split(/,|\band\b/).map((s) => s.trim()).filter((s) => s.length > 1)) {
        const x = phraseToField(item.replace(/^(a|an|the|some)\s+/i, ""), template);
        if (def.fields.some((d) => d.label.toLowerCase() === x.label.toLowerCase())) continue;
        def.fields.push({ key: uniqueKey(x.label, taken, x.key && !taken.has(x.key) ? x.key : undefined), label: x.label, type: x.type, required: x.required ?? false, config: x.config ?? {} });
        changes.push(`Added “${x.label}” (${x.type.toLowerCase().replace("_", " ")})`);
      }
      continue;
    }
    notUnderstood.push(part);
  }
  return { proposal: projectDef.parse(def), changes, notUnderstood };
}
