/**
 * הרצה מקומית: מעביר מזהה מסמך leads לפי הטלפון השמור בשדה phone.
 *
 * דורש ב-.env (או בסביבה): FIREBASE_SERVICE_ACCOUNT_JSON, ואופציונלית FIRESTORE_DATABASE_ID.
 *
 * דוגמאות:
 *   npx tsx scripts/migrate-contact-to-phone.ts --dry-run --match-name "ואדי קאסים"
 *   npx tsx scripts/migrate-contact-to-phone.ts --from-contact-id "user@example.com"
 */

import { migrateContactDocId, resolveMigrateContactParams } from "../lib/leads/migrateContactDocId";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const matchName = argValue("--match-name");
  const fromContactId = argValue("--from-contact-id");
  const databaseId = argValue("--database-id");

  if (!matchName && !fromContactId) {
    console.error("Usage: --match-name \"...\" | --from-contact-id <currentDocId> [--dry-run] [--database-id id]");
    process.exit(1);
  }

  const { db, fromId, toId } = await resolveMigrateContactParams({
    databaseId,
    matchName,
    fromContactId,
  });

  console.log("Resolved:", { fromId, toId, dryRun });
  const result = await migrateContactDocId({ db, fromId, toId, dryRun });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
