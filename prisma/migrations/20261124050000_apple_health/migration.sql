-- AlterTable
ALTER TABLE "HouseholdProfile" ADD COLUMN "healthTokenHash" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WellnessMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "externalKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WellnessMetric_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "HouseholdProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WellnessMetric" ("createdAt", "date", "id", "note", "profileId", "type", "unit", "value") SELECT "createdAt", "date", "id", "note", "profileId", "type", "unit", "value" FROM "WellnessMetric";
DROP TABLE "WellnessMetric";
ALTER TABLE "new_WellnessMetric" RENAME TO "WellnessMetric";
CREATE INDEX "WellnessMetric_profileId_type_date_idx" ON "WellnessMetric"("profileId", "type", "date");
CREATE UNIQUE INDEX "WellnessMetric_profileId_externalKey_key" ON "WellnessMetric"("profileId", "externalKey");
CREATE TABLE "new_Workout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "distanceKm" REAL,
    "kcalBurned" REAL,
    "intensity" TEXT NOT NULL DEFAULT 'moderate',
    "notes" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "externalKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Workout_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "HouseholdProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Workout" ("createdAt", "date", "distanceKm", "durationMin", "id", "intensity", "kcalBurned", "notes", "profileId", "type") SELECT "createdAt", "date", "distanceKm", "durationMin", "id", "intensity", "kcalBurned", "notes", "profileId", "type" FROM "Workout";
DROP TABLE "Workout";
ALTER TABLE "new_Workout" RENAME TO "Workout";
CREATE INDEX "Workout_profileId_date_idx" ON "Workout"("profileId", "date");
CREATE UNIQUE INDEX "Workout_profileId_externalKey_key" ON "Workout"("profileId", "externalKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdProfile_healthTokenHash_key" ON "HouseholdProfile"("healthTokenHash");

