/**
 * Purge old finished/cancelled games from Firestore.
 *
 * Safe rules:
 *   - NEVER touches 'active' games
 *   - NEVER touches 'lobby' games created in the last 24 hours
 *   - Deletes 'finished' and 'cancelled' games (+ all subcollections)
 *   - Deletes stale 'lobby' games older than 24 hours (never started)
 *
 * Usage:
 *   node scripts/purge-old-games.mjs          # dry run (no deletions)
 *   node scripts/purge-old-games.mjs --delete  # actually delete
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = !process.argv.includes('--delete');

const serviceAccount = JSON.parse(
  readFileSync(resolve(__dirname, '../bingoo-service-account.json'), 'utf8')
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const STALE_LOBBY_HOURS = 24;
const staleThreshold = new Date(Date.now() - STALE_LOBBY_HOURS * 60 * 60 * 1000);

console.log(DRY_RUN ? '🔍 DRY RUN — no data will be deleted\n' : '🗑  DELETING games...\n');

const gamesRef = db.collection('games');
const snapshot = await gamesRef.get();

let toDelete = [];
let skipped = [];

for (const doc of snapshot.docs) {
  const { status, createdAt } = doc.data();
  const created = createdAt?.toDate?.() ?? new Date(0);

  if (status === 'active') {
    skipped.push({ id: doc.id, status, reason: 'active — never touch' });
    continue;
  }

  if (status === 'lobby' && created > staleThreshold) {
    skipped.push({ id: doc.id, status, reason: `lobby created ${created.toISOString()} — too recent` });
    continue;
  }

  toDelete.push({ id: doc.id, status, created });
}

console.log(`Found ${snapshot.size} games total:`);
console.log(`  ✅ Safe to delete: ${toDelete.length}`);
console.log(`  ⏭  Skipping:       ${skipped.length}\n`);

if (skipped.length) {
  console.log('Skipped:');
  for (const g of skipped) console.log(`  ${g.id}  [${g.status}]  ${g.reason}`);
  console.log();
}

console.log('To delete:');
for (const g of toDelete) {
  console.log(`  ${g.id}  [${g.status}]  created ${g.created.toISOString()}`);
}

if (DRY_RUN) {
  console.log('\nRun with --delete to actually remove these games.');
  process.exit(0);
}

console.log('\nDeleting...');
let deleted = 0;
for (const g of toDelete) {
  await db.recursiveDelete(gamesRef.doc(g.id));
  console.log(`  ✓ deleted ${g.id}`);
  deleted++;
}

console.log(`\nDone. Deleted ${deleted} games.`);
