// Builds reference/usda-sr28.json from the USDA National Nutrient Database for Standard
// Reference, Release 28 (public domain, US Dept. of Agriculture, Agricultural Research Service).
// Usage: node scripts/build-usda-reference.mjs <dir containing ABBREV.txt and FOOD_DES.txt>
// The source files are distributed e.g. in the npm package "fda-nutrient-database@1.0.2" (data/).
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) { console.error("Pass the directory containing ABBREV.txt and FOOD_DES.txt"); process.exit(1); }
const split = (line) => line.replace(/\r$/, "").split("^").map((f) => f.replace(/^~|~$/g, ""));
const num = (s) => (s === "" || s === undefined ? null : Number(s));

const groups = {
  "0100": "dairy_egg", "0200": "spice", "0300": "baby", "0400": "fat_oil", "0500": "poultry",
  "0600": "soup_sauce", "0700": "meat", "0800": "cereal", "0900": "fruit", "1000": "meat",
  "1100": "vegetable", "1200": "nut_seed", "1300": "meat", "1400": "beverage", "1500": "seafood",
  "1600": "legume", "1700": "meat", "1800": "baked", "1900": "sweet", "2000": "grain",
  "2100": "fast_food", "2200": "prepared", "2500": "snack", "3500": "other", "3600": "restaurant",
};

const desc = new Map();
for (const line of fs.readFileSync(path.join(dir, "FOOD_DES.txt"), "latin1").split("\n")) {
  if (!line.trim()) continue;
  const f = split(line);
  desc.set(f[0], { group: groups[f[1]] ?? "other", name: f[2] });
}

const VOL_ML = { cup: 236.588, tbsp: 14.787, tsp: 4.929, "fl oz": 29.574 };
const out = [];
for (const line of fs.readFileSync(path.join(dir, "ABBREV.txt"), "latin1").split("\n")) {
  if (!line.trim()) continue;
  const f = split(line);
  const d = desc.get(f[0]);
  if (!d) continue;
  const portions = [[num(f[48]), f[49]], [num(f[50]), f[51]]].filter(([g, l]) => g && l);
  let gramsPerMl = null, gramsPerEach = null;
  for (const [g, label] of portions) {
    const m = label.match(/^([\d.\/]+)\s+(cup|tbsp|tsp|fl oz)\b/);
    if (m && gramsPerMl === null) {
      const amount = m[1].includes("/") ? m[1].split("/").reduce((a, b) => Number(a) / Number(b)) : Number(m[1]);
      if (amount > 0) gramsPerMl = Math.round((g / (amount * VOL_ML[m[2]])) * 1000) / 1000;
      continue;
    }
    const e = label.match(/^1\s+(large|medium|small|whole|fruit|item|egg|slice|clove|piece|each|breast|thigh|drumstick|wing|stalk|leaf|head|bulb|potato|onion|tomato|pepper|carrot|banana|apple|orange|lemon|lime|avocado|cucumber|zucchini|tortilla|bagel|muffin|roll|bun|link|patty|fillet|steak|chop|serving|container|package|can|bottle|bar|cookie|cracker|pita|cake)\b/);
    if (e && gramsPerEach === null) gramsPerEach = g;
  }
  out.push({
    ndb: f[0], name: d.name, group: d.group,
    kcal: num(f[3]), protein: num(f[4]), fat: num(f[5]), carbs: num(f[7]), fibre: num(f[8]), sugar: num(f[9]), sodiumMg: num(f[15]),
    gramsPerMl, gramsPerEach, portions: portions.map(([g, l]) => ({ grams: g, label: l })),
  });
}
const payload = {
  source: "USDA National Nutrient Database for Standard Reference, Release 28 (2015). Public domain. Values per 100 g edible portion.",
  count: out.length, foods: out,
};
fs.writeFileSync(path.join(process.cwd(), "reference", "usda-sr28.json"), JSON.stringify(payload));
console.log(`Wrote ${out.length} foods`);
