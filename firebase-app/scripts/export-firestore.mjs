// Exports every known collection to a timestamped JSON file so destructive
// admin actions (resetAllStudentData, migrations) always have a restore point.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json node scripts/export-firestore.mjs [output-dir]
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const expectedProjectId = 'nextgen-play-19dd2'
export const exportedCollections = [
  'users', 'directory', 'lessons', 'questions', 'progress', 'settings', 'news',
  'pvpMatches', 'worldBossConfig', 'worldBossScores', 'dailyQuests',
  'cyberSafetyScenarios', 'clientErrors',
]

function serializeValue(value) {
  if (value && typeof value.toDate === 'function') return { __timestamp: value.toDate().toISOString() }
  if (Array.isArray(value)) return value.map(serializeValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeValue(item)]))
  }
  return value
}

async function main() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key file first.')
    process.exitCode = 1
    return
  }
  const outputDir = resolve(process.argv[2] || 'backups')
  mkdirSync(outputDir, { recursive: true })
  const app = initializeApp({ credential: applicationDefault(), projectId: expectedProjectId })
  const db = getFirestore(app)

  const backup = { exportedAt: new Date().toISOString(), projectId: expectedProjectId, collections: {} }
  for (const name of exportedCollections) {
    const snapshot = await db.collection(name).get()
    backup.collections[name] = Object.fromEntries(snapshot.docs.map((item) => [item.id, serializeValue(item.data())]))
    console.log(`Exported ${snapshot.size} document(s) from ${name}.`)
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = resolve(outputDir, `firestore-backup-${stamp}.json`)
  writeFileSync(target, JSON.stringify(backup, null, 2), 'utf8')
  console.log(`Backup written to ${target}`)
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
if (isDirectRun) await main()
