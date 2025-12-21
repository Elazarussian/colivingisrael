/*
Backfill script: set createdBy/createdByDisplayName for apartments missing them.
Usage:
  node backfill_apartment_creators.js --adminUid=UID [--dryRun]

Environment:
  - FIREBASE_SERVICE_ACCOUNT: path to service account JSON or set GOOGLE_APPLICATION_CREDENTIALS

This script will:
  - initialize Firebase Admin
  - read all documents in `apartment` collection (path: `${dbPath}apartments`)
  - for documents missing `createdBy`, set `createdBy` and `createdByDisplayName` to the provided admin UID/displayName
  - supports --dryRun to only print what would be changed
*/

const { argv } = require('process');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = {};
  for (const a of argv.slice(2)) {
    const [k, v] = a.split('=');
    if (k.startsWith('--')) args[k.slice(2)] = v === undefined ? true : v;
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const dryRun = !!args.dryRun;
  const adminUid = args.adminUid;

  // Initialize admin SDK
  if (!admin.apps.length) {
    const saPath = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!saPath) {
      console.error('FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS is required to run this script.');
      process.exit(1);
    }
    const sa = require(path.resolve(saPath));
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }

  const db = admin.firestore();

  // Find adminUid if not provided: look up first profile with role=admin
  let ownerUid = adminUid;
  let ownerDisplayName = 'admin';
  if (!ownerUid) {
    console.log('No --adminUid provided. Attempting to detect an admin from `profiles` collection...');
    const profilesSnap = await db.collection('profiles').where('role', '==', 'admin').limit(1).get();
    if (!profilesSnap.empty) {
      const doc = profilesSnap.docs[0];
      ownerUid = doc.id;
      ownerDisplayName = (doc.data() && doc.data().displayName) || ownerUid;
      console.log('Detected admin uid:', ownerUid, 'displayName:', ownerDisplayName);
    } else {
      console.error('No admin found in `profiles`. Please provide --adminUid=UID');
      process.exit(1);
    }
  }

  // Read apartments (respect test/real path? assume root 'apartments')
  const collectionRef = db.collection('apartments');
  const snapshot = await collectionRef.get();
  console.log('Found', snapshot.size, 'apartment documents.');

  const toUpdate = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (!data || !data.createdBy) {
      toUpdate.push({ id: doc.id, data });
    }
  });

  if (toUpdate.length === 0) {
    console.log('No apartments need backfilling.');
    process.exit(0);
  }

  console.log('Documents to update:', toUpdate.length);
  for (const item of toUpdate) {
    console.log(' ->', item.id);
  }

  if (dryRun) {
    console.log('Dry run enabled — exiting without changes.');
    process.exit(0);
  }

  for (const item of toUpdate) {
    const docRef = collectionRef.doc(item.id);
    try {
      await docRef.set({ createdBy: ownerUid, createdByDisplayName: ownerDisplayName }, { merge: true });
      console.log('Updated', item.id);
    } catch (err) {
      console.error('Error updating', item.id, err);
    }
  }

  console.log('Backfill completed.');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
