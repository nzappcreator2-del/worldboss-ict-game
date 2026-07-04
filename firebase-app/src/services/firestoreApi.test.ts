import { describe, expect, it } from 'vitest'
import { claimLegacyUserData, selectQuestionsForLesson } from './firestoreApi'

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
