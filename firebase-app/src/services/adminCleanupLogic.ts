// Pure planner for the admin "ทำความสะอาดระบบ" tab.
//
// This project was migrated from an older system, so Firestore accumulates rows
// that no longer belong to anything: error logs, finished PVP rooms, progress
// for deleted students. Cleaning that up is useful — and irreversible — so the
// destructive part is split in two: this module decides *exactly which document
// ids* would be deleted from an in-memory snapshot (fully testable, touches
// nothing), and adminApi only ever deletes ids that came out of here.
//
// Two rules are load-bearing:
//   1. No task may target an authored-content collection wholesale (see
//      CLEANUP_PROTECTED_COLLECTIONS) — those are the teacher's lessons, exams,
//      news and settings, and the system is in active use.
//   2. The orphan scan treats an empty parent collection as "failed to read",
//      never as "everything is orphaned", so a transient read error can't cost
//      the whole database.

export type CleanupRow = Record<string, unknown> & { id: string }

export type CleanupSnapshot = {
  users: CleanupRow[]
  directory: CleanupRow[]
  progress: CleanupRow[]
  lessons: CleanupRow[]
  questions: CleanupRow[]
  teacherQuests: CleanupRow[]
  clientErrors: CleanupRow[]
  pvpMatches: CleanupRow[]
  pvpRooms: CleanupRow[]
  pvpRankings: CleanupRow[]
  worldBossScores: CleanupRow[]
}

export type CleanupCollection = keyof CleanupSnapshot

export const emptyCleanupSnapshot = (): CleanupSnapshot => ({
  users: [], directory: [], progress: [], lessons: [], questions: [],
  teacherQuests: [], clientErrors: [], pvpMatches: [], pvpRooms: [],
  pvpRankings: [], worldBossScores: [],
})

// Authored content the cleanup tab must never wipe wholesale.
export const CLEANUP_PROTECTED_COLLECTIONS = ['lessons', 'questions', 'settings', 'news', 'cyberSafetyScenarios', 'dailyQuests'] as const

export type CleanupTaskKey = 'players' | 'logs' | 'gameSessions' | 'orphans'

export type CleanupTaskDefinition = {
  key: CleanupTaskKey
  label: string
  description: string
  danger: 'high' | 'medium' | 'low'
  // Collections this task empties completely. The orphan task leaves this empty
  // because it deletes selected rows, not whole collections.
  collections: CleanupCollection[]
}

export const CLEANUP_TASKS: CleanupTaskDefinition[] = [
  {
    key: 'players',
    label: 'ลบผู้เล่นทั้งหมด',
    description: 'ลบบัญชีนักเรียนทุกคน (users), รายชื่อสาธารณะ (directory) และความก้าวหน้าทั้งหมด (progress) — บทเรียนและข้อสอบไม่ถูกแตะต้อง',
    danger: 'high',
    // Order matters: `directory` first. Deletes commit in batches, so a run cut
    // short mid-way leaves whatever came last. A leftover directory row whose
    // user document is gone makes that student's name permanently unusable at
    // login, while a leftover user document is invisible and harmless.
    collections: ['directory', 'progress', 'users'],
  },
  {
    key: 'logs',
    label: 'ล้าง log ระบบ',
    description: 'ลบบันทึกข้อผิดพลาดจากเบราว์เซอร์ (clientErrors) ทั้งหมด — ไม่กระทบการเล่นเกม',
    danger: 'low',
    collections: ['clientErrors'],
  },
  {
    key: 'gameSessions',
    label: 'ล้างข้อมูลเกมค้าง',
    description: 'ลบห้อง PVP ที่ค้าง, ประวัติการต่อสู้เก่า, อันดับ PVP และคะแนน World Boss — ผู้เล่นและบทเรียนไม่ถูกแตะต้อง',
    danger: 'medium',
    collections: ['pvpMatches', 'pvpRooms', 'pvpRankings', 'worldBossScores'],
  },
  {
    key: 'orphans',
    label: 'ล้างข้อมูลกำพร้า',
    description: 'ลบเฉพาะแถวที่ไม่มีเจ้าของแล้ว: progress/directory/คะแนน PVP และ World Boss ของนักเรียนที่ถูกลบ, ข้อสอบและเควสต์ของบทเรียนที่ถูกลบ',
    danger: 'medium',
    collections: [],
  },
]

export function cleanupTask(key: CleanupTaskKey): CleanupTaskDefinition {
  const task = CLEANUP_TASKS.find((item) => item.key === key)
  if (!task) throw new Error(`unknown cleanup task: ${key}`)
  return task
}

export type CleanupTarget = { collection: CleanupCollection; id: string }
export type CleanupPlan = {
  targets: CleanupTarget[]
  summary: Array<{ collection: CleanupCollection; label: string; count: number }>
  total: number
}

const COLLECTION_LABELS: Record<CleanupCollection, string> = {
  users: 'บัญชีนักเรียน',
  directory: 'รายชื่อสาธารณะ',
  progress: 'ความก้าวหน้า',
  lessons: 'บทเรียน',
  questions: 'ข้อสอบ',
  teacherQuests: 'เควสต์ครู',
  clientErrors: 'log ข้อผิดพลาด',
  pvpMatches: 'ประวัติ PVP (เก่า)',
  pvpRooms: 'ห้อง PVP',
  pvpRankings: 'อันดับ PVP',
  worldBossScores: 'คะแนน World Boss',
}

// An orphan scan is only meaningful when the parent collection actually loaded.
// An empty parent means "unknown", so nothing is considered orphaned.
const orphansOf = (
  children: CleanupRow[],
  parents: CleanupRow[],
  parentKeyOf: (row: CleanupRow) => string,
  childKeyOf: (row: CleanupRow) => string,
): CleanupRow[] => {
  if (parents.length === 0) return []
  const known = new Set(parents.map(parentKeyOf))
  return children.filter((child) => !known.has(childKeyOf(child)))
}

export function planCleanup(keys: CleanupTaskKey[], snapshot: CleanupSnapshot): CleanupPlan {
  const selected = keys.filter((key) => CLEANUP_TASKS.some((task) => task.key === key))
  // Keyed by "collection/id" so two tasks selecting the same row delete it once.
  const targets = new Map<string, CleanupTarget>()
  const add = (collection: CleanupCollection, rows: CleanupRow[]) => {
    for (const row of rows) targets.set(`${collection}/${row.id}`, { collection, id: row.id })
  }

  for (const key of selected) {
    for (const collection of cleanupTask(key).collections) add(collection, snapshot[collection])
  }

  if (selected.includes('orphans')) {
    const userId = (row: CleanupRow) => String(row.userId || '')
    const lessonId = (row: CleanupRow) => String(row.lessonId || '')
    const selfId = (row: CleanupRow) => row.id
    const lessonSelfId = (row: CleanupRow) => String(row.lessonId || row.id)
    add('progress', orphansOf(snapshot.progress, snapshot.users, selfId, userId))
    add('directory', orphansOf(snapshot.directory, snapshot.users, selfId, selfId))
    add('questions', orphansOf(snapshot.questions, snapshot.lessons, lessonSelfId, lessonId))
    add('teacherQuests', orphansOf(snapshot.teacherQuests, snapshot.lessons, lessonSelfId, lessonId))
    // Score rows live outside the user document, so a student deleted before
    // the delete-cascade existed can still be sitting on the leaderboards.
    add('worldBossScores', orphansOf(snapshot.worldBossScores, snapshot.users, selfId, userId))
    add('pvpRankings', orphansOf(snapshot.pvpRankings, snapshot.users, selfId, selfId))
  }

  const all = [...targets.values()]
  const summary = (Object.keys(COLLECTION_LABELS) as CleanupCollection[])
    .map((collection) => ({
      collection,
      label: COLLECTION_LABELS[collection],
      count: all.filter((target) => target.collection === collection).length,
    }))
    .filter((line) => line.count > 0)
  return { targets: all, summary, total: all.length }
}

// Typed-confirmation gate. Wiping players is categorically worse than clearing
// a log, so it demands a phrase the teacher cannot type by reflex.
export function cleanupConfirmPhrase(keys: CleanupTaskKey[]): string {
  const selected = keys.filter((key) => CLEANUP_TASKS.some((task) => task.key === key))
  if (selected.length === 0) return ''
  return selected.some((key) => cleanupTask(key).danger === 'high') ? 'ลบถาวร' : 'ยืนยัน'
}
