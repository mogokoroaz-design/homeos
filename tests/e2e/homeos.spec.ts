import { test, expect, type Page } from "@playwright/test";

// One household per project run; tests build on each other in order.
test.describe.configure({ mode: "serial" });

async function unlock(page: Page, name: string, pin: string) {
  await page.goto("/lock");
  await page.getByRole("button", { name }).click();
  await page.locator("#pin").fill(pin);
  await page.getByRole("button", { name: "Unlock" }).click();
  await page.waitForURL("**/today");
}
async function lock(page: Page) {
  await page.getByRole("button", { name: "Lock or switch profile" }).click();
  await page.waitForURL("**/lock");
}

test("setup needs only names; each person adds their own PIN from their profile", async ({ page }) => {
  await page.goto("/");
  if (page.url().includes("/lock")) return; // second project reuses the household
  await page.waitForURL("**/setup");
  await expect(page.locator("input[type=password]")).toHaveCount(0);
  await page.fill("input[name=householdName]", "E2E Home");
  await page.fill("input[name=name0]", "Alex");
  await page.fill("input[name=name1]", "Sam");
  await page.getByRole("button", { name: "Create household" }).click();
  await page.waitForURL("**/lock");
  await expect(page.getByText("No PIN")).toHaveCount(2);
  for (const [name, pin] of [["Alex", "1234"], ["Sam", "5678"]] as const) {
    await page.getByRole("button", { name }).click(); // no PIN → opens straight away
    await page.waitForURL("**/today");
    await page.goto("/people#security");
    await expect(page.getByText(/anyone on this device can open your profile/)).toBeVisible();
    await page.getByRole("button", { name: "Add a PIN" }).click();
    await page.getByLabel("PIN (4–8 digits)").fill(pin);
    await page.getByLabel("Repeat PIN").fill(pin);
    await page.getByRole("button", { name: "Save PIN" }).click();
    await expect(page.getByText(/PIN added/)).toBeVisible();
    await lock(page);
  }
  await expect(page.getByText("No PIN")).toHaveCount(0);
});

test("wrong PIN is rejected; correct PIN unlocks", async ({ page }) => {
  await page.goto("/lock");
  await page.getByRole("button", { name: "Sam" }).click();
  await page.locator("#pin").fill("0000");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText("Incorrect PIN")).toBeVisible();
  await unlock(page, "Alex", "1234");
  await expect(page.getByRole("heading", { name: /Alex/ })).toBeVisible();
  await page.goto("/settings"); // locked-down routes need a session
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("recipe → meal plan with per-person portions → grocery list", async ({ page }, info) => {
  const name = `Lemon pasta ${info.project.name}`;
  await unlock(page, "Alex", "1234");
  await page.goto("/food/recipes/new");
  await page.getByLabel("Recipe name").fill(name);
  await page.getByPlaceholder(/One ingredient per line/).fill("200 g spaghetti\n1 lemon\n2 tbsp olive oil");
  await page.getByRole("button", { name: /Parse/ }).click();
  await expect(page.getByLabel("Ingredient").nth(2)).toHaveValue("olive oil");
  await page.getByLabel("Instructions").fill("Boil the spaghetti for 10 minutes\nToss with lemon and olive oil");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await page.waitForURL(/\/food\/recipes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();

  await page.getByRole("button", { name: "Plan" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Add to plan" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.goto("/food/plan");
  await expect(page.getByRole("link", { name }).first()).toBeVisible();
  await expect(page.getByLabel("Alex servings").first()).toBeVisible();
  await expect(page.getByLabel("Sam servings").first()).toBeVisible();
  await page.goto("/food/grocery");
  await expect(page.getByText("Spaghetti", { exact: true }).first()).toBeVisible();
});

test("conversational pantry entry is previewed then approved", async ({ page }) => {
  await unlock(page, "Alex", "1234");
  await page.goto("/food/pantry");
  await page.getByLabel("Describe pantry change").fill("bought 500 g spaghetti and 3 lemons");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("Needs your approval")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/Added 500 g Spaghetti/)).toBeVisible();
  await page.reload();
  await expect(page.locator("li", { hasText: "Spaghetti" }).first()).toBeVisible();
});

test("kitchen assistant answers from pantry records", async ({ page }) => {
  await unlock(page, "Alex", "1234");
  await page.goto("/food/assistant");
  await page.getByLabel("Message").fill("What ingredients do we have?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/only know what has been recorded/)).toBeVisible();
});

test("global notes panel works from any screen", async ({ page }, info) => {
  await unlock(page, "Alex", "1234");
  await page.goto("/money");
  await page.getByRole("button", { name: "Open notes" }).click();
  const panel = page.getByRole("complementary", { name: "Notes" });
  await panel.getByPlaceholder("Title").fill(`Cleaner note ${info.project.name}`);
  await panel.getByPlaceholder("Write a note…").fill("Please water the ferns");
  await panel.getByRole("button", { name: "Add note" }).click();
  await expect(panel.getByText(`Cleaner note ${info.project.name}`)).toBeVisible();
  await expect(page).toHaveURL(/\/money$/);
});

test("project builder: natural language → private project → entry", async ({ page }) => {
  await unlock(page, "Alex", "1234");
  await page.goto("/projects/new");
  await page.getByPlaceholder(/daily journal/).fill("I want to create a daily journal where I can record my mood, what happened during the day, what I learned, what I am grateful for and how I felt.");
  await page.getByRole("button", { name: "Propose structure" }).click();
  await expect(page.getByText("Proposed project")).toBeVisible();
  await page.getByLabel("Refine instruction").fill("add a photo; make mood out of 10");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(/Added “Photo”/)).toBeVisible();
  await expect(page.getByText(/1–10 rating/)).toBeVisible();
  await page.getByRole("button", { name: /Approve/ }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  await page.getByLabel("What happened").fill("Long walk by the river");
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByText("Long walk by the river").last()).toBeVisible();
  await page.evaluate(() => localStorage.setItem("e2e.project", location.pathname));
});

test("privacy: Sam cannot see Alex's private records", async ({ page }) => {
  await unlock(page, "Alex", "1234");
  await page.goto("/people");
  await page.getByLabel("Value").fill("71.4");
  await page.getByRole("button", { name: "Log" }).first().click();
  await expect(page.getByText("71.4 kg").first()).toBeVisible();
  const projectPath = await page.evaluate(() => localStorage.getItem("e2e.project"));
  await lock(page);
  await unlock(page, "Sam", "5678");
  await page.goto("/people");
  await expect(page.getByText("71.4")).toHaveCount(0);
  await page.getByRole("link", { name: "Alex" }).click();
  await expect(page.getByText(/records are private/)).toBeVisible();
  if (projectPath) {
    const res = await page.goto(projectPath);
    expect(res?.status()).toBe(404);
  }
  await page.goto("/projects");
  await expect(page.getByText("No projects yet")).toBeVisible();
});

test("receipt photo → local OCR → review → shared ledger", async ({ page, browser }, info) => {
  const render = await browser.newPage({ viewport: { width: 420, height: 480 }, deviceScaleFactor: 2 });
  const tag = info.project.name.toUpperCase();
  await render.setContent(`<pre style="font:20px/1.45 monospace;padding:24px;color:#111;background:#fff">CORNER MARKET ${tag}\n11/21/2026\n\nAPPLES          3.20\nCOFFEE BEANS   11.49\n\nTOTAL          14.69</pre>`);
  const png = await render.screenshot();
  await render.close();
  await unlock(page, "Sam", "5678");
  await page.goto("/money/receipts");
  await page.locator("input[type=file]").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: png });
  await page.waitForURL(/\/money\/receipts\/[0-9a-f-]{36}$/, { timeout: 90_000 });
  await expect(page.getByText("Review receipt")).toBeVisible();
  await expect(page.getByLabel("Item").first()).toHaveValue(/APPLES/);
  await page.getByRole("button", { name: /Approve/ }).click();
  await expect(page.getByText(/expense recorded|Saved to the household ledger/).first()).toBeVisible();
  await page.goto("/money/expenses?month=2026-11");
  await expect(page.getByText(new RegExp(`CORNER MARKET`)).first()).toBeVisible();
});

test("calendar and settings backup", async ({ page }) => {
  await unlock(page, "Alex", "1234");
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Back up now" }).click();
  await expect(page.locator("li", { hasText: "manual" }).first()).toBeVisible();
});

test("Apple Health export upload lands in my private records", async ({ page }) => {
  const xml = `<?xml version="1.0"?><HealthData>\n <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-11-19 08:00:00 -0800" endDate="2026-11-19 09:00:00 -0800" value="9876"/>\n <Workout workoutActivityType="HKWorkoutActivityTypeCycling" duration="40" durationUnit="min" sourceName="Watch" startDate="2026-11-19 07:00:00 -0800" endDate="2026-11-19 07:40:00 -0800"/>\n</HealthData>\n`;
  await unlock(page, "Alex", "1234");
  await page.goto("/people#health");
  await page.locator("input[type=file][accept*='.zip']").setInputFiles({ name: "export.xml", mimeType: "text/xml", buffer: Buffer.from(xml) });
  await expect(page.getByText(/Imported/).first()).toBeVisible();
  await expect(page.getByText(/1 day of steps/).first()).toBeVisible();
  await expect(page.getByText("Cycling").first()).toBeVisible();
});


test("recipe page: scale servings, switch units, cook mode with timer", async ({ page }, info) => {
  await unlock(page, "Alex", "1234");
  await page.goto("/food/recipes");
  await page.getByText(`Lemon pasta ${info.project.name}`).first().click();
  await page.waitForURL(/\/food\/recipes\/[0-9a-f-]{36}$/);
  const pasta = page.locator("li", { hasText: "spaghetti" }).first();
  await page.getByRole("button", { name: "Original" }).click();
  await expect(pasta).toContainText("200 g");
  await page.getByRole("button", { name: "More servings" }).click();
  await expect(pasta).toContainText("300 g");
  await page.getByRole("button", { name: "Imperial" }).click();
  await expect(pasta).toContainText(/oz/);
  await page.getByRole("button", { name: "Metric" }).click();
  await page.getByRole("button", { name: "10 minutes" }).first().click();
  await expect(page.getByText("Step 1").first()).toBeVisible();
  await page.getByRole("button", { name: "Cook mode" }).click();
  const cook = page.getByRole("dialog", { name: /Cook mode/ });
  await expect(cook.getByText("Step 1 of 2")).toBeVisible();
  await expect(cook.getByText("Boil the spaghetti for 10 minutes")).toBeVisible();
  await cook.getByRole("button", { name: "Next" }).click();
  await expect(cook.getByText("Step 2 of 2")).toBeVisible();
  await cook.getByRole("button", { name: "Ingredients" }).click();
  await expect(cook.getByRole("complementary", { name: "Ingredients" })).toContainText("spaghetti");
  await cook.getByRole("button", { name: "Done cooking" }).click();
  await expect(cook).toBeHidden();
});

test("share sheet: shared caption → unlock → automatic import → review", async ({ page }) => {
  const caption = "Garlic Yogurt Dip\nServes 4\nIngredients\n200g greek yogurt\n1 garlic clove\nSteps\n1. Mix everything.\n2. Chill for 30 minutes.";
  await page.goto(`/food/import?share=${encodeURIComponent(caption)}`);
  await page.waitForURL(/\/lock\?next=/);
  await page.getByRole("button", { name: "Alex" }).click();
  await page.locator("#pin").fill("1234");
  await page.getByRole("button", { name: "Unlock" }).click();
  await page.waitForURL(/\/food\/import\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByText("Review imported recipe")).toBeVisible();
  await expect(page.getByLabel("Recipe name")).toHaveValue("Garlic Yogurt Dip");
  await expect(page.getByLabel("Ingredient").first()).toHaveValue("greek yogurt");
});

test("every page loads without errors", async ({ page }) => {
  const errors: string[] = [];
  let current = "";
  page.on("pageerror", (e) => errors.push(`${current}: ${e.message.slice(0, 80)}`));
  await unlock(page, "Alex", "1234");
  for (const path of ["/today", "/people", "/food", "/food/plan", "/food/plan?view=month", "/food/recipes", "/food/recipes/new", "/food/pantry", "/food/grocery", "/food/nutrition", "/food/assistant", "/food/import", "/food/catalogue", "/home", "/home/services", "/home/maintenance", "/money", "/money/expenses", "/money/receipts", "/money/bills", "/money/budgets", "/money/prices", "/projects", "/projects/new", "/calendar", "/insights", "/notes", "/assistant", "/settings"]) {
    current = path;
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByText(/Application error|Something went wrong|Unhandled Runtime Error/), path).toHaveCount(0);
    await expect(page.locator("main h1, main h2").first(), path).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("adapt a recipe into a variant and file it in a collection", async ({ page }, info) => {
  await unlock(page, "Alex", "1234");
  await page.goto("/food/recipes");
  await page.getByText(`Lemon pasta ${info.project.name}`).first().click();
  await page.waitForURL(/\/food\/recipes\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Adapt" }).click();
  await page.getByRole("button", { name: "Gluten-free" }).click();
  await expect(page.getByText(/spaghetti → gluten-free spaghetti/)).toBeVisible();
  await page.getByRole("button", { name: "Save as new recipe" }).click();
  await expect(page.getByRole("heading", { name: `Lemon pasta ${info.project.name} (Gluten-free)` })).toBeVisible();
  await expect(page.getByText("Adapted from").first()).toBeVisible();
  await page.getByRole("button", { name: "Collections" }).click();
  await page.getByLabel("New collection name").fill(`Quick ${info.project.name}`);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("dialog").getByText(`Quick ${info.project.name}`)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/food/recipes");
  await page.getByRole("link", { name: new RegExp(`Quick ${info.project.name}`) }).click();
  await expect(page.getByText(`Lemon pasta ${info.project.name} (Gluten-free)`)).toBeVisible();
  await expect(page.getByText(`Lemon pasta ${info.project.name}`, { exact: true })).toHaveCount(0);
});

test("shopping list is grouped by store section and sections can be reordered", async ({ page }) => {
  await unlock(page, "Alex", "1234");
  await page.goto("/food/grocery");
  await page.getByPlaceholder("Add item…").fill("bananas");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fruit & veg" })).toBeVisible();
  const first = async () => (await page.getByRole("list", { name: "Store layout" }).locator("[data-section]").first().textContent())?.trim();
  const before = await first();
  await page.getByRole("button", { name: `Move ${before} down` }).click();
  await expect.poll(first).not.toBe(before);
  await page.getByRole("button", { name: `Move ${before} up` }).click(); // restore for the next run
  await expect.poll(first).toBe(before);
});


test("project builder: the exact screenshot description creates a working project", async ({ page }) => {
  await unlock(page, "Alex", "1234");
  await page.goto("/projects/new");
  await page.getByPlaceholder(/daily journal/).fill("I want to create a daily journal where I can record my mood, what happened during the day, what I learned, what I am grateful for and how I felt. this should help me learn how to regulate emotions better.");
  await page.getByRole("button", { name: "Propose structure" }).click();
  await expect(page.getByText(/because you mentioned emotional regulation/)).toBeVisible();
  await page.getByRole("button", { name: /Approve/ }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  await page.getByLabel("What helped").fill("A short walk");
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByText("A short walk").last()).toBeVisible();
});
