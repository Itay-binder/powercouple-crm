/**
 * Deletes all opportunities from a specific Firestore tenant database.
 *
 * Safety guards:
 * - Requires explicit --database-id
 * - Requires explicit --confirm <database-id>
 * - Dry-run by default, use --execute to actually delete
 *
 * Examples:
 *   npx tsx scripts/reset-tenant-opportunities.ts --database-id powercouple --confirm powercouple
 *   npx tsx scripts/reset-tenant-opportunities.ts --database-id powercouple --confirm powercouple --execute
 */

import { getFirestoreForDatabaseId } from "../lib/firebase/admin";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

async function main() {
  const databaseId = argValue("--database-id")?.trim();
  const confirm = argValue("--confirm")?.trim();
  const execute = process.argv.includes("--execute");

  if (!databaseId) {
    console.error("Missing required flag: --database-id <id>");
    process.exit(1);
  }
  if (!confirm) {
    console.error("Missing required flag: --confirm <id>");
    process.exit(1);
  }
  if (confirm !== databaseId) {
    console.error("Safety check failed: --confirm must exactly match --database-id");
    process.exit(1);
  }

  const db = getFirestoreForDatabaseId(databaseId);
  const snap = await db.collection("opportunities").get();
  const total = snap.size;

  console.log(JSON.stringify({ databaseId, totalOpportunities: total, mode: execute ? "execute" : "dry-run" }, null, 2));

  if (!execute) {
    console.log("Dry-run complete. Add --execute to perform deletion.");
    return;
  }

  let deleted = 0;
  let batch = db.batch();
  let inBatch = 0;

  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    inBatch++;
    if (inBatch === 450) {
      await batch.commit();
      deleted += inBatch;
      console.log(`Committed batch. Deleted so far: ${deleted}/${total}`);
      batch = db.batch();
      inBatch = 0;
    }
  }

  if (inBatch > 0) {
    await batch.commit();
    deleted += inBatch;
  }

  console.log(JSON.stringify({ databaseId, deleted, done: true }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
