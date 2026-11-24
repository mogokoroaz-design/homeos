import { prisma } from "@/lib/db";
import { createHousehold } from "@/lib/household";
import type { Viewer } from "@/lib/auth/session";

const TABLES = ["AuditLog", "AIAction", "AIMessage", "AIConversation", "NoteLink", "NoteAttachment", "Note", "Reminder", "CalendarOccurrence", "CalendarEvent", "ProjectReminder", "ProjectIntegration", "ProjectEntry", "ProjectField", "Project", "RoutineCompletion", "PersonalRoutine", "HabitLog", "Habit", "Workout", "WellnessMetric", "MaintenanceRecord", "HomeAsset", "ServiceVisit", "ServiceProvider", "HouseholdTaskCompletion", "HouseholdTask", "PriceComparison", "PriceRecord", "ProductVariant", "Product", "Brand", "ReceiptItem", "Receipt", "BillAttachment", "BillPayment", "Bill", "Expense", "Budget", "BudgetCategory", "ShoppingHistory", "GroceryItem", "GroceryList", "InventoryTransaction", "PantryItem", "NutritionTarget", "FoodLogItem", "FoodLog", "MealServing", "MealPlanItem", "MealPlan", "RecipeImport", "RecipeImage", "RecipeIngredient", "Recipe", "Ingredient", "FoodItem", "UploadedFile", "RecurringSchedule", "AppSetting", "ProfileAccess", "UserSession", "HouseholdProfile", "Household"];

export async function resetDb() {
  for (const t of TABLES) await prisma.$executeRawUnsafe(`DELETE FROM "${t}"`);
}

/** Two-person household. Returns viewers for Alex and Sam. */
export async function seedHousehold(): Promise<{ alex: Viewer; sam: Viewer }> {
  await resetDb();
  const h = await createHousehold({ householdName: "Test", currency: "USD", profiles: [{ name: "Alex", pin: "1234", color: "#9cc2b0" }, { name: "Sam", pin: "5678", color: "#c4a68f" }] });
  const ps = await prisma.householdProfile.findMany({ orderBy: { createdAt: "asc" } });
  const v = (i: number): Viewer => ({ profileId: ps[i].id, householdId: h.id, name: ps[i].name, color: ps[i].color, currency: "USD" });
  return { alex: v(0), sam: v(1) };
}
