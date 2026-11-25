# HomeOS

A local-first household and personal operating system for one household with individual, PIN-protected profiles. Food (meal planning, recipes, pantry, groceries, nutrition), home (cleaning, gardening, maintenance, service providers), money (one shared ledger, receipts with local OCR, bills, budgets, brand/price comparison), personal wellness, private AI-assisted projects, a unified calendar, insights and global notes — in one integrated app.

**Zero cost to run.** Everything is free and open source and runs on your Mac. No cloud account, paid API, hosted database or subscription is needed. AI is optional and local.

---

## 1. Install on your Mac

Requirements: macOS, **Node.js 20 or newer** (free LTS installer from nodejs.org, or `brew install node`). About 600 MB of disk for dependencies.

```bash
cd homeos
npm install          # installs dependencies and generates the Prisma client
npm run setup        # creates .env and data/, applies DB migrations, builds the app
npm start            # http://localhost:3000
```

On first open you'll name the household and each person — no PINs. HomeOS then opens straight to the Today dashboard. Tap your name (top right) to switch between people; each person can set a PIN from their profile (the **Set a PIN** button next to their name) to lock their private records.

Development mode with hot reload: `npm run dev`.

### Use it on the shared iPad

1. Keep the Mac on and HomeOS running (`npm start` listens on your local network).
2. On the iPad (same Wi‑Fi) open `http://<your-mac-name>.local:3000` — find the name in *System Settings → General → Sharing → Local hostname*.
3. Safari → Share → **Add to Home Screen** for a full-screen app.

**Voice input, camera barcode scanning and the offline shell need HTTPS** on the iPad (a browser rule for non-`localhost` addresses). Free option with mkcert:

```bash
brew install mkcert && mkcert -install
mkdir -p certs && mkcert -key-file certs/key.pem -cert-file certs/cert.pem <your-mac-name>.local localhost 127.0.0.1
npm run start:https                      # https://<your-mac-name>.local:3443
```

Then AirDrop `$(mkcert -CAROOT)/rootCA.pem` to the iPad, install the profile (*Settings → Profile Downloaded*), and enable full trust in *Settings → General → About → Certificate Trust Settings*. Receipt photos use the camera through the normal file picker and work over plain HTTP too.

To start HomeOS automatically at login you can add `npm start` (run in the project folder) as a Login Item via a small Automator app or `launchd` plist — optional.

### Apple Health & Fitness

People → **Apple Health**:
1. **History** — in the iPhone Health app tap your profile picture → *Export All Health Data*, AirDrop the `export.zip` to the Mac and upload it. Steps, active energy, weight, resting heart rate, water, sleep and workouts go into that person's private records. iPhone + Apple Watch overlaps are not double counted; re-importing updates instead of duplicating.
2. **Daily sync** — create a sync key, then follow the in-app guide to build a small iPhone Shortcut (free, built into iOS) that sends each day's totals to `http://<your-mac>.local:3000/api/health/sync` on a nightly automation. Apple doesn't let websites read Health data directly, and a native app would need a paid Apple developer account, so this is the zero-cost route.

### Optional: local AI with Ollama (free)

HomeOS works fully without AI (a deterministic rule-based assistant). To add a local model:

```bash
brew install ollama          # or download from ollama.com
ollama serve &
ollama pull llama3.2:3b      # ~2 GB; any chat model works, e.g. qwen2.5:7b on 16 GB+ Macs
```

Then *Settings → Assistant & AI → Rules + local AI*, press **Test connection**, Save.

**Food photos.** *Pantry* and *Shopping list* have **Add from photo**: snap groceries, a fridge shelf or a product, review the detected list (untick, fix amounts, choose Pantry or Shopping list per item) and only then add. Without a model, HomeOS reads printed product labels with on-device OCR (e.g. "Greek Yogurt 500 g"). To also recognise loose fruit, veg and unlabelled items, pull a small local vision model and put its name in *Settings → Photo model*:

```bash
ollama pull qwen2.5vl:3b     # ~3 GB, works on 8 GB Macs (alternative: moondream)
```

Photos are stored in `data/uploads`; amounts guessed from a photo are saved as *estimated* unless you edit them. For privacy HomeOS only talks to Ollama on this Mac or your LAN; no data goes to any cloud service. External paid providers are intentionally not integrated.

---

## 2. What's in the box

| Section | Highlights |
|---|---|
| **Today** | Configurable dashboard: today's meals with per-person portions and one-tap logging, due tasks, private routines & habits, upcoming appointments, groceries, bills, expiring items, spending vs budget, projects, pinned notes, “Ask HomeOS”. |
| **People** | Profile (age, height, activity, goals, diet prefs), weight history & goal, steps, sleep, hydration, resting HR, energy/stress, workouts, habits with streaks, routines, nutrition targets (manual or Mifflin–St Jeor estimate, applied only after approval), and per-category sharing permissions. |
| **Food Hub** | Recipe pages with a servings scaler, Original/Metric/Imperial toggle (cups use USDA densities), tick-off ingredients, tap-to-start step timers and a full-screen cook mode (big text, Back/Next, voice “next / back / repeat / start timer”, read-aloud, keep-screen-on); “Save to HomeOS” share-sheet import from Instagram/TikTok/YouTube/Safari; recipe adaptation into saved variants (gluten-free, dairy-free, vegan, vegetarian, egg-free, nut-free, less sugar, swaps, removals — original kept); recipe collections; diet badges; weekly/monthly meal planner that follows every member's diet & allergies (from their profile) and flags conflicts with per-person servings sized from each person's own targets, leftovers, prep notes, substitutions, copy week, cost estimate; recipe library (photos, tags, favourites, scaling, pantry check, linked notes); importer (web links via schema.org data, Instagram/YouTube captions where accessible, pasted text/transcripts, screenshots via local OCR, video + transcript) with editable preview; pantry with locations, expiry, low-stock alerts, confidence levels, conversational/voice entry, add-from-photo (label OCR or a local vision model, reviewed before saving), barcode scanning where supported, full transaction history; grocery manager generated from the plan minus pantry, grouped by store section in your own aisle order, unit conversion, package-size pricing, duplicate merging, shopping completion → pantry + ledger + price history; nutrition log per person; kitchen assistant; ingredient catalogue linked to USDA data. |
| **Home** | Recurring tasks (daily/weekly on chosen days/monthly/yearly, intervals, end dates, skip), cleaning/kitchen/laundry/gardening/maintenance categories, rooms, assignees, completion history; service providers with standing instructions, scheduled visits on the calendar, completion with payment into the ledger and next appointment; appliances with warranties; maintenance records with costs and next-service dates. |
| **Money** | One shared household ledger (paid-by per entry), categories, monthly budgets, budget vs actual, trends; receipt/bill photo → local OCR → review → approve; original image preserved; card numbers masked to last 4; duplicate detection (identical image, and same merchant/date/total); bills with schedules, reminders, attachments and payment history (tracking only — never pays); price history by product/brand/variant/package/store with unit-price normalisation, best value, per-store lows, increases and switching savings. |
| **Projects** | Describe a tracker in plain words → proposed structure (≈35 built-in templates such as gratitude, dream, workout, cycle, skincare, weekly review, side business, plant care, plus typed fields from any list you write) → refine in plain words (“add a photo, make energy 1-10, remove notes”) → approve. 14 field types (incl. checklist, image, tags and safe formulas). Private to the owner. Reminders appear only on the owner's calendar. Optional *approved* aggregate sharing (count/sum/average per week) to Insights — never entry content. |
| **Calendar** | One view of household & private events (recurring, complete/skip/move), meals & prep, tasks, bills (incl. projected recurrences), service visits, maintenance, reminders, and — only for you — workouts, routines and project reminders. |
| **Insights** | Spending trends, budget performance, grocery price increases, switching savings, pantry waste, task completion, service visits, your nutrition/weight/exercise/habits, project activity and shared summaries. Every chart says when there isn't enough data. |
| **Notes** | Global slide-over panel from every screen plus a full page: quick/long notes, checklists, images, tags, pin, search, private or shared, links to recipes/projects/products (auto-offered on those pages). |
| **Assistant** | Household and kitchen assistants (text + voice). See §4. |
| **Settings** | AI engine, dashboard cards, auto-lock, change PIN, backups (create/download/import/restore), JSON export, erase my personal data, audit history. |

---

## 3. Architecture

Modular monolith: **Next.js 15 (App Router) + React 19 + TypeScript**, Tailwind CSS 4 with hand-built shadcn-style components, **Prisma 6 + SQLite**, Zod validation, Recharts, Tesseract.js, lucide icons. No microservices, no external services.

```
prisma/schema.prisma        normalized data model (65 tables), migrations in prisma/migrations
reference/usda-sr28.json    8,789 foods from USDA SR28 (public domain) — validated nutrition, densities, per-item weights
src/lib/                    domain services (server-side, framework-independent, unit-testable)
  auth/                     PIN hashing (scrypt), sessions, access grants
  food/                     catalog, parse, recipes, nutrition, pantry, mealplan, grocery, planner, foodlog, importer
  finance/                  ledger, bills, receipts, receipt-parser, ocr, prices
  home/ personal/ projects/ services for each module
  ai/                       provider abstraction (Ollama / rules), approval-gated actions, assistant
  calendar.ts insights.ts notes.ts backup.ts tar.ts units.ts money.ts dates.ts recurrence.ts
src/app/(auth)/             setup + lock screens
src/app/(app)/<section>/    pages (server components) + actions.ts (server actions → services)
src/app/api/                file serving with access checks, uploads, receipts, assistant, import, backup/export
src/components/             UI kit, shell (sidebar, top bar, notes panel, quick add), module components, charts
tests/unit, tests/integration, tests/e2e
data/                       (git-ignored) homeos.db, uploads/, backups/, cache/
```

Pages read through services; mutations go through server actions that validate with Zod, call a service, write an audit entry for important changes, and revalidate. Services take an explicit `viewer` so privacy rules are enforced (and tested) below the UI.

### How the modules connect

- **Meal plan → Pantry → Groceries → Money → Insights.** Planned recipe meals are scaled by everyone's servings (+ leftovers), converted to each ingredient's shopping unit, reduced by pantry stock (any convertible unit), and written to the active shopping list with estimated prices from recorded price history. Any change to meals, portions or pantry recalculates the list. Finishing a shopping trip adds bought items to the pantry, records an expense and stores prices. Cooking a meal proposes the pantry deductions.
- **Receipt → Expense → Price history → Pantry.** OCR draft → human review → one transaction writes the expense (with tax and receipt link), a price record per item (normalised unit price), and optional pantry stock.
- **People → Nutrition → Meal planner → Food log → Insights.** Each person's current target sizes their default portion; planned portions log into their private food log in one tap; logs feed trends.
- **Home → Calendar → Money → Notes.** Visits/tasks/maintenance appear on the calendar; completing a visit records payment and books the next one; provider instructions and notes stay with the record.
- **Projects → Calendar → Insights.** Project reminders appear on the owner's calendar; approved summaries (numbers only) feed Insights.

---

## 4. AI design

`Recommend → Preview → Approve → Execute → Record`

- The assistant never touches the database directly. It calls application functions to *read*, and may only *propose* an `AIAction` (pantry update, meal plan, grocery add, cooked-meal deductions, nutrition targets, AI recipe, project creation). Each kind has a Zod schema and a dedicated executor; the user can edit the preview before approving; only the proposing profile can approve; results are stored and audited.
- **Rule-based engine (default)** handles: what can I cook / without shopping / with X, Y, Z; what's left / what vegetables / what's expiring; conversational pantry changes; missing ingredients for a recipe; what to buy; meal plans with day count, slots, budget, “no X more than N times”, exclusions, pantry preference; calories today; bills due; spending vs last month; cheapest product/store, larger-package comparison, price increases, switching savings; what's happening today/tomorrow/this week; creating projects; adding to the list; setting calorie targets.
- **Local AI (optional)** is used for open questions (answered strictly from a pantry/meal-plan/recipe snapshot), drafting a recipe when no saved recipe matches (clearly labelled, saved only on approval), structuring messy imported text, and refining project structures. All model output is parsed and validated; nothing it produces is executed as code. Money, nutrition, quantities and budgets are always computed deterministically.
- The assistant distinguishes confirmed / estimated / unverified pantry quantities and states that it only knows what has been recorded.

---

## 5. Privacy & security model

- **Each person can lock their profile with a PIN** (optional; added, changed or removed from People → Privacy & PIN). A profile without a PIN opens directly (each device reopens the last profile used) and shows a reminder that anyone on the device can open it; switching to a profile with a PIN asks for it. PINs are stored as salted scrypt hashes. 5 wrong attempts → 5-minute lockout. Sessions are random tokens (stored hashed) in an httpOnly cookie, expire after inactivity (default 30 min, configurable) and are cleared by Lock/Switch.
- **Authorization is enforced server-side in services**, not by which profile is selected: wellness metrics, workouts, habits, routines, food logs and targets require `owner === viewer` or an explicit `ProfileAccess` grant for that category (wellness / nutrition / fitness / habits), which only the owner can switch on. Projects are owner-only with no override. Private notes, events, reminders and uploaded files are filtered by owner + visibility; files are only served via `/api/files/:id` after that check.
- Shared household data (recipes, pantry, meal plan, groceries, ledger, bills, tasks, providers, shared notes/events) is visible to all members.
- Audit log of important changes; private items are logged without content.
- Export (`Settings → Export`) contains shared data + your own private data, never another person's private data or PIN hashes. *Erase my personal data* removes your private records after PIN confirmation (backup taken first).
- No personal data is sent anywhere by default. The only outbound requests are recipe-link imports you explicitly start (local-network addresses are blocked) and, if you enable it, your own local Ollama.

### Backups

*Settings → Back up now* writes a consistent SQLite snapshot (`VACUUM INTO`) plus all uploads to `data/backups/<name>/`. Download any backup as a `.tar`, keep it on another drive, and import it later. Restore requires your PIN, takes a safety backup first, and signs everyone out. Simplest off-machine copy: include the `data/` folder in Time Machine.

---

## 6. Calculations & documented assumptions

| Topic | Rule |
|---|---|
| Money | Integer cents everywhere; parsing rounds half away from zero; no floats stored. Currency set at setup. |
| Units | Mass g/kg/mg/oz/lb, volume ml/l/tsp/tbsp/cup(236.59 ml)/fl oz/pint/quart/gallon (US), count each/dozen. Cross-dimension conversion only with a known density (g/ml) or per-item weight — derived from USDA household measures or entered by you; otherwise the app reports “cannot convert” instead of guessing. |
| Nutrition | Only from USDA SR28 (per 100 g), product labels (normalised from serving size), or values you mark as your estimate. AI never supplies nutrition. Recipe nutrition lists any ingredient it couldn't include; logs flag estimates. |
| Targets | Mifflin–St Jeor BMR (sex-neutral constant −78 if unspecified) × activity factor 1.2 / 1.375 / 1.55 / 1.725 / 1.9; goal −500 / 0 / +300 kcal (min 1,200); macros 25 % protein / 45 % carbs / 30 % fat of energy; fibre 14 g per 1,000 kcal. Always a proposal. |
| Portions | Person's target × slot share (breakfast 25 %, lunch 30 %, dinner 35 %, snack 10 %) ÷ kcal per serving, rounded to ¼, clamped 0.5–4; 1 serving if no data. Editable. |
| Grocery prices | Best (lowest unit price) recorded price per product variant in the last 12 months; whole packages when a package size is known. Unpriced items are listed, never assumed. |
| Price comparison | Unit price = price ÷ package size in base unit; shown per kg / L / item (+ per oz / fl oz). Only same-dimension options are compared. Prices are recorded purchases, never claimed as live market prices. Switching savings = Σ (paid unit price − cheapest unit price) × quantity bought, last 90 days. |
| Meal planner | Scores each saved recipe by pantry coverage, recorded cost, favourites and repeats, then fills slots greedily respecting “≤ N times” and exclusions; warns when the budget can't be met. Pantry coverage is evaluated per recipe against current stock (not simulated across the week). |
| Recurrence | Daily (every N days), weekly (chosen weekdays, every N weeks from the start week), monthly (day of month, clamped to month end), yearly; optional end date. Dates are local `YYYY-MM-DD` strings with DST-safe arithmetic. |

---

## 7. Limitations (and the functional alternative)

- **Instagram / YouTube / TikTok**: platforms often block automated access and never expose audio. HomeOS uses the public caption/description when available and otherwise explains why; paste the caption/transcript or upload screenshots (OCR'd locally). Uploaded videos are stored, but audio is not transcribed locally (no bundled speech-to-text) — add the transcript.
- **OCR quality** depends on the photo. Crumpled or faint receipts produce partial results; the review screen flags totals that don't add up. HEIC images: iPad Safari converts camera photos to JPEG automatically; if you upload HEIC from the Mac, export as JPEG first.
- **Barcode scanning** uses the browser BarcodeDetector API (Chrome/Edge on Mac; not Safari/iPad as of writing). Manual barcode entry works everywhere; barcodes map to your own ingredient catalogue (no online product database).
- **Voice input** uses the browser's speech recognition (Safari/Chrome), requires HTTPS off-localhost, and may be processed by the browser vendor depending on device settings — type instead if that matters to you.
- **Nutrition reference** is USDA SR28 (2015, generic foods, US-centric). Branded products: enter label values.
- **Bills are tracked, not paid.** No bank connections.
- E2E tests run Chromium at desktop and iPad Pro 11 sizes; the container used to build this had no WebKit, so give Safari on the actual iPad a quick check.

---

## 8. Testing

```bash
npm run typecheck
npm test             # 64 unit + integration tests on an isolated SQLite DB (data/test), incl. real offline OCR
npm run test:e2e     # builds, starts a production server on :3100 with data/e2e, runs 10 flows × (desktop, iPad viewport)
```

Integration tests cover privacy isolation, the shared ledger, portions, grocery generation & recalculation, pantry deduction across units, shopping completion, the assistant's approval flow, meal-plan constraints, receipt → expense/prices/pantry, duplicate detection, brand & package comparisons, recurring bills/tasks, visits → ledger → calendar, insights grounding, backup/restore/archive round-trip, and Tesseract OCR on a rendered receipt. E2E (Playwright) drives setup, PIN lock, recipe → plan → groceries, conversational pantry, kitchen assistant, notes panel, project builder, cross-profile privacy, receipt upload → OCR → approval → ledger, calendar and backup.

### Acceptance checklist

| # | Requirement | Verified by |
|---|---|---|
| 1–3 | Separate profiles; private records not exposed without permission; shared data accessible | privacy.test.ts, e2e “privacy” |
| 4 | One unified ledger | privacy.test.ts, food/money tests |
| 5–8 | Weekly plan, independent portions, grocery lists, pantry reduces requirements | food.test.ts, e2e recipe→plan→groceries |
| 9 | Conversational ingredient entry | food.test.ts, e2e pantry |
| 10–11 | Multiple import methods; save/edit recipes | parsers.test.ts (text, JSON-LD), food.test.ts, import UI (link/text/screenshots/video) |
| 12 | Daily nutrition totals | food.test.ts |
| 13–17 | Receipt upload, local OCR, review, ledger, historical prices | backup-ocr.test.ts, money-home.test.ts, e2e receipt |
| 18 | Fair brand / package comparison | money-home.test.ts |
| 19–21 | Recurring tasks, cleaning/gardening visits, bills with reminders | money-home.test.ts |
| 22–23 | Private projects from natural language; editable fields | parsers.test.ts, privacy.test.ts, e2e builder |
| 24 | Global notes everywhere | e2e notes panel |
| 25 | Calendar connects modules | privacy & money-home tests |
| 26 | Insights from stored data | money-home.test.ts |
| 27 | Survives restart | SQLite on disk; verified by restarting the production server |
| 28 | Backup & restore | backup-ocr.test.ts, e2e backup |
| 29 | No paid API | default engine is rule-based; OCR, nutrition and AI are local |
| 30 | iPad + desktop | e2e on both viewports (Chromium); check Safari on device |

### Dependency notes

All dependencies are free/open source (MIT / Apache-2.0 / ISC). `npm audit` reports advisories only in development tooling (the Prisma CLI's config loader and the Vitest runner, fixed upstream only in new major versions); they do not ship in or run with the app. Next's bundled PostCSS is pinned to a patched release via `overrides`.

## 9. Troubleshooting

- *“Locked — unlock your profile first”*: the session auto-locked; unlock again (Settings → Security to change the timeout).
- Forgot a PIN: by design no other profile can reset it. Whoever has Terminal access to the Mac can set a new one: `node -e "const c=require('crypto');const s=c.randomBytes(16).toString('hex');console.log(c.scryptSync('NEWPIN',s,32,{N:16384,r:8,p:1}).toString('hex'),s)"` and write the two values into that profile's `pinHash`/`pinSalt` with `npx prisma studio`. (Anyone with full access to the Mac's disk can read the database — use FileVault and a macOS login password.)
- Port in use: `PORT=3001 npm start` is not read by `next start`; use `npx next start -H 0.0.0.0 -p 3001`.
- Rebuild the USDA reference from source: `node scripts/build-usda-reference.mjs <dir with ABBREV.txt and FOOD_DES.txt>`.
