// Backfills the reduced public /directory collection from existing /users docs.
// Must run BEFORE deploying the rules that lock /users reads, otherwise
// existing students cannot find their profile from the login picker.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json node scripts/backfill-directory.mjs           (dry run)
//   GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json node scripts/backfill-directory.mjs --commit
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const expectedProjectId = 'nextgen-play-19dd2'
const commit = process.argv.includes('--commit')

export function directoryEntryFromUser(user) {
  return {
    name: String(user.name || ''),
    class: String(user.class || ''),
    avatar: String(user.avatar || '🧙‍♂️'),
    xp: Number(user.xp) || 0,
    level: Number(user.level) || 1,
    rank: String(user.rank || 'BRONZE'),
  }
}

async function main() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key file first.')
    process.exitCode = 1
    return
  }
  const app = initializeApp({ credential: applicationDefault(), projectId: expectedProjectId })
  const db = getFirestore(app)
  const users = await db.collection('users').get()
  console.log(`Found ${users.size} user document(s).`)

  let written = 0
  let batch = db.batch()
  for (const snapshot of users.docs) {
    const entry = { ...directoryEntryFromUser(snapshot.data()), updatedAt: FieldValue.serverTimestamp() }
    if (commit) batch.set(db.collection('directory').doc(snapshot.id), entry, { merge: true })
    written += 1
    if (commit && written % 400 === 0) {
      await batch.commit()
      batch = db.batch()
    }
  }
  if (commit && written % 400 !== 0) await batch.commit()
  console.log(commit
    ? `Backfilled ${written} directory entr(ies).`
    : `Dry run only: would backfill ${written} directory entr(ies). Re-run with --commit to write.`)
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
if (isDirectRun) await main()
