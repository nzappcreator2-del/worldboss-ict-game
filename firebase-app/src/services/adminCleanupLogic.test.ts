import { describe, expect, it } from 'vitest'
import {
  CLEANUP_TASKS,
  CLEANUP_PROTECTED_COLLECTIONS,
  cleanupConfirmPhrase,
  cleanupTask,
  emptyCleanupSnapshot,
  planCleanup,
  type CleanupSnapshot,
} from './adminCleanupLogic'

const snapshot = (override: Partial<CleanupSnapshot> = {}): CleanupSnapshot => ({
  ...emptyCleanupSnapshot(),
  ...override,
})

const ids = (plan: ReturnType<typeof planCleanup>, collection: string) =>
  plan.targets.filter((target) => target.collection === collection).map((target) => target.id).sort()

describe('CLEANUP_TASKS', () => {
  it('never lists a content collection the teacher would not expect to lose', () => {
    // Lessons, questions, settings and news are the teacher's authored content:
    // no cleanup task may ever target them wholesale.
    const wholesale = CLEANUP_TASKS.flatMap((task) => task.collections)
    for (const protectedCollection of CLEANUP_PROTECTED_COLLECTIONS) {
      expect(wholesale).not.toContain(protectedCollection)
    }
  })

  it('describes every task with a Thai label and a danger level', () => {
    for (const task of CLEANUP_TASKS) {
      expect(task.label.length).toBeGreaterThan(0)
      expect(['high', 'medium', 'low']).toContain(task.danger)
    }
  })

  it('exposes each task by key', () => {
    expect(cleanupTask('players').danger).toBe('high')
    expect(cleanupTask('logs').danger).toBe('low')
  })
})

describe('planCleanup — players', () => {
  const players = snapshot({
    users: [{ id: 'u1' }, { id: 'u2' }],
    directory: [{ id: 'u1' }, { id: 'u2' }],
    progress: [{ id: 'p1', userId: 'u1' }, { id: 'p2', userId: 'u2' }],
    lessons: [{ id: 'L1' }],
  })

  it('deletes every user, directory mirror and progress row', () => {
    const plan = planCleanup(['players'], players)
    expect(ids(plan, 'users')).toEqual(['u1', 'u2'])
    expect(ids(plan, 'directory')).toEqual(['u1', 'u2'])
    expect(ids(plan, 'progress')).toEqual(['p1', 'p2'])
  })

  it('leaves authored lesson content untouched', () => {
    const plan = planCleanup(['players'], players)
    expect(ids(plan, 'lessons')).toEqual([])
  })

  // Deletes commit in batches, so an interrupted run leaves whatever came last.
  // A stranded directory row blocks that student's name at login forever; a
  // stranded user document is invisible. Directory must therefore go first.
  it('deletes the directory row before the user document it mirrors', () => {
    const plan = planCleanup(['players'], players)
    const order = plan.targets.map((target) => target.collection)
    expect(order.indexOf('directory')).toBeLessThan(order.indexOf('users'))
  })

  it('summarizes the damage per collection before anything is deleted', () => {
    const plan = planCleanup(['players'], players)
    expect(plan.total).toBe(6)
    expect(plan.summary.find((line) => line.collection === 'users')?.count).toBe(2)
  })
})

describe('planCleanup — logs', () => {
  it('clears the client error log only', () => {
    const plan = planCleanup(['logs'], snapshot({
      clientErrors: [{ id: 'e1' }, { id: 'e2' }],
      users: [{ id: 'u1' }],
    }))
    expect(ids(plan, 'clientErrors')).toEqual(['e1', 'e2'])
    expect(ids(plan, 'users')).toEqual([])
  })
})

describe('planCleanup — gameSessions', () => {
  it('clears stale match, room, ranking and world-boss score rows', () => {
    const plan = planCleanup(['gameSessions'], snapshot({
      pvpMatches: [{ id: 'm1' }],
      pvpRooms: [{ id: 'r1' }],
      pvpRankings: [{ id: 'k1' }],
      worldBossScores: [{ id: 'w1' }],
      users: [{ id: 'u1' }],
    }))
    expect(plan.total).toBe(4)
    expect(ids(plan, 'users')).toEqual([])
  })
})

describe('planCleanup — orphans', () => {
  const orphaned = snapshot({
    users: [{ id: 'u1' }],
    directory: [{ id: 'u1' }, { id: 'ghost' }],
    progress: [{ id: 'p1', userId: 'u1' }, { id: 'p2', userId: 'gone' }],
    lessons: [{ id: 'L1', lessonId: 'L1' }],
    questions: [{ id: 'q1', lessonId: 'L1' }, { id: 'q2', lessonId: 'L9' }],
    teacherQuests: [{ id: 'TQ1', lessonId: 'L1' }, { id: 'TQ2', lessonId: 'L9' }],
  })

  it('removes only rows whose owner or lesson no longer exists', () => {
    const plan = planCleanup(['orphans'], orphaned)
    expect(ids(plan, 'directory')).toEqual(['ghost'])
    expect(ids(plan, 'progress')).toEqual(['p2'])
    expect(ids(plan, 'questions')).toEqual(['q2'])
    expect(ids(plan, 'teacherQuests')).toEqual(['TQ2'])
  })

  it('keeps every row that still resolves', () => {
    const plan = planCleanup(['orphans'], orphaned)
    expect(ids(plan, 'users')).toEqual([])
    expect(plan.total).toBe(4)
  })

  // Score rows live outside the user document, so a student deleted before the
  // cascade existed can still be sitting on the leaderboards.
  it('sweeps leaderboard rows belonging to students who no longer exist', () => {
    const plan = planCleanup(['orphans'], snapshot({
      users: [{ id: 'u1' }],
      worldBossScores: [{ id: 'u1_B1', userId: 'u1' }, { id: 'gone_B1', userId: 'gone' }],
      pvpRankings: [{ id: 'u1' }, { id: 'gone' }],
    }))
    expect(ids(plan, 'worldBossScores')).toEqual(['gone_B1'])
    expect(ids(plan, 'pvpRankings')).toEqual(['gone'])
  })

  it('refuses to treat anything as orphaned when the parent collection failed to load', () => {
    // An empty `lessons` list is ambiguous — a real wipe or a failed read — so
    // the scan must not delete every question in the system on that basis.
    const plan = planCleanup(['orphans'], snapshot({
      lessons: [],
      questions: [{ id: 'q1', lessonId: 'L1' }],
      users: [],
      progress: [{ id: 'p1', userId: 'u1' }],
    }))
    expect(plan.total).toBe(0)
  })
})

describe('planCleanup — combined runs', () => {
  it('de-duplicates rows targeted by more than one task', () => {
    const plan = planCleanup(['players', 'orphans'], snapshot({
      users: [{ id: 'u1' }],
      directory: [{ id: 'u1' }, { id: 'ghost' }],
      progress: [{ id: 'p1', userId: 'gone' }],
      lessons: [{ id: 'L1' }],
    }))
    expect(ids(plan, 'directory')).toEqual(['ghost', 'u1'])
    expect(ids(plan, 'progress')).toEqual(['p1'])
    expect(plan.total).toBe(4)
  })

  it('returns an empty plan when nothing is selected', () => {
    const plan = planCleanup([], snapshot({ users: [{ id: 'u1' }] }))
    expect(plan.total).toBe(0)
    expect(plan.summary).toEqual([])
  })

  it('ignores unknown task keys instead of guessing', () => {
    const plan = planCleanup(['nope' as never], snapshot({ users: [{ id: 'u1' }] }))
    expect(plan.total).toBe(0)
  })
})

describe('cleanupConfirmPhrase', () => {
  it('demands the strict phrase whenever a high-danger task is selected', () => {
    expect(cleanupConfirmPhrase(['players'])).toBe('ลบถาวร')
    expect(cleanupConfirmPhrase(['players', 'logs'])).toBe('ลบถาวร')
  })

  it('uses the light phrase for reversible-in-spirit maintenance tasks', () => {
    expect(cleanupConfirmPhrase(['logs'])).toBe('ยืนยัน')
    expect(cleanupConfirmPhrase(['orphans', 'gameSessions'])).toBe('ยืนยัน')
  })

  it('has no phrase when nothing is selected', () => {
    expect(cleanupConfirmPhrase([])).toBe('')
  })
})
