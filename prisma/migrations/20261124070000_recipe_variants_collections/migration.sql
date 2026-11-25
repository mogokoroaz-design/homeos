-- CreateTable
CREATE TABLE "RecipeCollection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RecipeCollectionItem" (
    "collectionId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("collectionId", "recipeId"),
    CONSTRAINT "RecipeCollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "RecipeCollection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecipeCollectionItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Recipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "cuisine" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'main',
    "servings" REAL NOT NULL DEFAULT 2,
    "prepMinutes" INTEGER,
    "cookMinutes" INTEGER,
    "temperature" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceUrl" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '',
    "favourite" BOOLEAN NOT NULL DEFAULT false,
    "createdByProfileId" TEXT,
    "variantOfId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Recipe_variantOfId_fkey" FOREIGN KEY ("variantOfId") REFERENCES "Recipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Recipe" ("category", "cookMinutes", "createdAt", "createdByProfileId", "cuisine", "favourite", "id", "instructions", "name", "notes", "prepMinutes", "servings", "sourceType", "sourceUrl", "tags", "temperature", "updatedAt") SELECT "category", "cookMinutes", "createdAt", "createdByProfileId", "cuisine", "favourite", "id", "instructions", "name", "notes", "prepMinutes", "servings", "sourceType", "sourceUrl", "tags", "temperature", "updatedAt" FROM "Recipe";
DROP TABLE "Recipe";
ALTER TABLE "new_Recipe" RENAME TO "Recipe";
CREATE INDEX "Recipe_name_idx" ON "Recipe"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "RecipeCollection_name_key" ON "RecipeCollection"("name");

