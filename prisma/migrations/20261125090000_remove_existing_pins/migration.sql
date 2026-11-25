-- One-time reset requested by the household: PINs become opt-in. Every profile starts without a PIN
-- (each person can set one again from their profile). Signed-in devices are signed out once so
-- HomeOS reopens straight to the dashboard. No other data is changed.
UPDATE "HouseholdProfile" SET "pinHash" = NULL, "pinSalt" = NULL, "failedPinAttempts" = 0, "pinLockedUntil" = NULL;
DELETE FROM "UserSession";
