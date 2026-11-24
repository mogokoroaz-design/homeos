-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HouseholdProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#8fb3a3',
    "pinHash" TEXT,
    "pinSalt" TEXT,
    "failedPinAttempts" INTEGER NOT NULL DEFAULT 0,
    "pinLockedUntil" DATETIME,
    "birthDate" TEXT,
    "sex" TEXT,
    "heightCm" REAL,
    "goalWeightKg" REAL,
    "activityLevel" TEXT NOT NULL DEFAULT 'moderate',
    "goal" TEXT NOT NULL DEFAULT 'maintain',
    "dietPreferences" TEXT NOT NULL DEFAULT '',
    "fitnessGoals" TEXT NOT NULL DEFAULT '',
    "dashboardConfig" TEXT NOT NULL DEFAULT '{}',
    "healthTokenHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HouseholdProfile_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_HouseholdProfile" ("activityLevel", "birthDate", "color", "createdAt", "dashboardConfig", "dietPreferences", "failedPinAttempts", "fitnessGoals", "goal", "goalWeightKg", "healthTokenHash", "heightCm", "householdId", "id", "name", "pinHash", "pinLockedUntil", "pinSalt", "sex", "updatedAt") SELECT "activityLevel", "birthDate", "color", "createdAt", "dashboardConfig", "dietPreferences", "failedPinAttempts", "fitnessGoals", "goal", "goalWeightKg", "healthTokenHash", "heightCm", "householdId", "id", "name", "pinHash", "pinLockedUntil", "pinSalt", "sex", "updatedAt" FROM "HouseholdProfile";
DROP TABLE "HouseholdProfile";
ALTER TABLE "new_HouseholdProfile" RENAME TO "HouseholdProfile";
CREATE UNIQUE INDEX "HouseholdProfile_healthTokenHash_key" ON "HouseholdProfile"("healthTokenHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

