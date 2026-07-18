import { describe, expect, it } from 'vitest'
import { active, claimLegacyUserData, firestoreApi, selectQuestionsForLesson, sortActiveNews } from './firestoreApi'

describe('active flag parsing', () => {
  it('treats sheet-era falsy spellings as inactive and defaults missing values to active', () => {
    expect(active(undefined)).toBe(true)
    expect(active(true)).toBe(true)
    expect(active('TRUE')).toBe(true)
    expect(active(false)).toBe(false)
    expect(active('false')).toBe(false)
    expect(active(' FALSE ')).toBe(false)
    expect(active(0)).toBe(false)
    expect(active('0')).toBe(false)
  })
})

describe('sortActiveNews', () => {
  it('uses Firestore update time ahead of mixed Thai and ISO display dates', () => {
    const rows = [
      { id: 'older', title: 'ข่าวเดิม', date: '2026-05-31', updatedAt: { toMillis: () => 1_700_000_000_000 }, isActive: true },
      { id: 'newer', title: 'ข่าวใหม่', date: '15/7/2569', updatedAt: { toMillis: () => 1_800_000_000_000 }, isActive: true },
      { id: 'hidden', title: 'ไม่เผยแพร่', date: '2027-01-01', updatedAt: { toMillis: () => 1_900_000_000_000 }, isActive: false },
    ]

    expect(sortActiveNews(rows).map((item) => item.id)).toEqual(['newer', 'older'])
  })
})

describe('claimLegacyUserData', () => {
  it('returns the selected avatar immediately when claiming an imported user without one', () => {
    expect(claimLegacyUserData({ name: 'Ada', class: 'ป.5' }, 'auth-1', '🧝‍♀️')).toMatchObject({
      name: 'Ada',
      class: 'ป.5',
      ownerUid: 'auth-1',
      avatar: '🧝‍♀️',
    })
  })

  it('preserves an existing imported avatar while binding the Firebase owner', () => {
    expect(claimLegacyUserData({ name: 'Ada', avatar: '🧙‍♂️' }, 'auth-1', '⚔️')).toMatchObject({
      name: 'Ada',
      ownerUid: 'auth-1',
      avatar: '🧙‍♂️',
    })
  })
})

describe('allocateStatPoint', () => {
  it('is exposed as a server-authoritative mutation on the Firebase service surface', () => {
    expect(firestoreApi.allocateStatPoint).toBeTypeOf('function')
  })
})

describe('selectQuestionsForLesson', () => {
  it('builds a playable PVP set from choice post-tests and prioritizes dedicated questions', () => {
    const rows = [
      { id: 'fallback', lessonId: 'L1', type: 'posttest', pattern: 'choice', questionText: 'คำถามทั่วไป' },
      { id: 'matching', lessonId: 'L2', type: 'posttest', pattern: 'matching', questionText: 'จับคู่' },
      { id: 'pretest', lessonId: 'L3', type: 'pretest', pattern: 'choice', questionText: 'ก่อนเรียน' },
      { id: 'pvp', lessonId: 'PVP_MODE', type: 'posttest', pattern: 'choice', questionText: 'คำถาม PVP' },
    ]

    expect(selectQuestionsForLesson(rows, 'PVP_MODE', false).map((item) => item.id)).toEqual(['pvp', 'fallback'])
  })
})
