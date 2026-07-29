// The backup script is the only restore point before a migration or an admin
// wipe, and its collection list is hand-maintained — a name added to the app
// but forgotten here is silently absent from every backup taken afterwards
// (that is how teacherQuests, pvpRooms and pvpRankings went unbacked-up for
// months). firestore.rules is the one file that must name every collection the
// app can write, so derive the expectation from it instead of restating a list.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { exportedCollections } from './export-firestore.mjs'

const rulesPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'firestore.rules')
const rules = readFileSync(rulesPath, 'utf8')

// Top-level collections sit at exactly four spaces of indentation under
// `match /databases/{database}/documents`; subcollections (chat, presence) are
// nested deeper and are not separately exportable, so indentation is the filter.
function topLevelCollectionsFromRules(): string[] {
  const names = new Set<string>()
  for (const line of rules.split('\n')) {
    const match = /^ {4}match \/([A-Za-z][A-Za-z0-9_]*)\//.exec(line)
    if (match) names.add(match[1])
  }
  // The catch-all `match /{collectionName}/{documentId}` gates readable content
  // collections through a literal allow-list rather than its own match block.
  const catchAll = /collectionName in \[([^\]]+)\]/.exec(rules)
  for (const quoted of catchAll?.[1].match(/'([^']+)'/g) || []) names.add(quoted.slice(1, -1))
  return [...names].sort()
}

describe('exportedCollections', () => {
  it('covers every collection firestore.rules allows the app to write', () => {
    const declared = topLevelCollectionsFromRules()

    // Guards the guard: a rules file that stopped parsing would make this test
    // pass vacuously.
    expect(declared).toContain('users')
    expect(declared).toContain('teacherQuests')
    expect(declared.length).toBeGreaterThan(10)

    expect(declared.filter((name) => !exportedCollections.includes(name))).toEqual([])
  })

  it('keeps retired collections listed so older backups stay restorable', () => {
    expect(exportedCollections).toContain('worldBossConfig')
  })

  it('lists each collection once', () => {
    expect(new Set(exportedCollections).size).toBe(exportedCollections.length)
  })
})
