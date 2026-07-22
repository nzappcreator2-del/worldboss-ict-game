import { describe, expect, it } from 'vitest'
import { adminQuestion, resetUserData, sanitizePublicSettings, studentReport } from './adminLogic'

describe('admin data safety', () => {
  it('stores only the known public settings keys', () => {
    expect(sanitizePublicSettings({
      TimerPerQuestion: '30',
      AdminPIN: '1234',
      GeminiAPIKey: 'secret',
      SecretWebhook: 'https://example.invalid',
      Classes: 'P5',
      Rooms: '1,2',
      CertHeader: 'Certificate',
      CertFooter: 'ICT',
    })).toEqual({
      TimerPerQuestion: '30',
      Classes: 'P5',
      Rooms: '1,2',
      CertHeader: 'Certificate',
      CertFooter: 'ICT',
    })
  })

  it('resets game state without changing identity fields', () => {
    expect(resetUserData({ name: 'Ada', ownerUid: 'auth-1', xp: 900, coins: 200 })).toMatchObject({
      name: 'Ada', ownerUid: 'auth-1', xp: 0, coins: 0, level: 1, rank: 'BRONZE',
      inventory: { potion: 0, magnifier: 0, dailyDone: [] },
    })
  })

  // The reset rebuilds `inventory` from scratch rather than deleting known
  // keys, so every feature added later is cleared by default. These assertions
  // pin that down: a half-reset student keeping quest stamps or worksheet
  // submissions would look "already done" on work they no longer have.
  it('clears every progress bag a reset student must not keep', () => {
    const reset = resetUserData({
      name: 'Ada',
      ownerUid: 'auth-1',
      xp: 900,
      coins: 200,
      inventory: {
        potion: 5,
        badges: ['badge_streak_7', 'ดาวเด่น'],
        worksheets: { L1: { answer: 'ส่งแล้ว', submittedAt: '2026-07-18' } },
        teacherQuests: { TQ001: { acceptedAt: '2026-07-17', turnedInAt: '2026-07-18' } },
        cosmetics: { owned: ['hat-crown'], equipped: { hat: 'hat-crown' } },
        stats: { atk: 9 },
      },
    })
    const inventory = reset.inventory as Record<string, unknown>
    expect(inventory.teacherQuests).toBeUndefined()
    expect(inventory.worksheets).toBeUndefined()
    expect(inventory.badges).toEqual([])
    expect(inventory.cosmetics).toBeUndefined()
    expect(inventory.stats).toBeUndefined()
    expect(inventory.potion).toBe(0)
  })

  it('keeps the identity fields a reset must not touch', () => {
    const reset = resetUserData({
      name: 'Ada', class: 'ป.5/1', avatar: '🧙', gender: 'female', ownerUid: 'auth-1', userId: 'u1',
    })
    // Wiping ownerUid here would silently unbind the student's device, and
    // gender drives their character sheet.
    expect(reset).toMatchObject({
      name: 'Ada', class: 'ป.5/1', avatar: '🧙', gender: 'female', ownerUid: 'auth-1', userId: 'u1',
    })
  })
})

describe('admin view mapping', () => {
  it('maps stored question fields to the legacy editor contract', () => {
    expect(adminQuestion('Q1', {
      lessonId: 'L1', questionText: '2+2?', opt1: '3', opt2: '4', answer: 2, type: 'posttest',
    })).toMatchObject({ id: 'Q1', lessonId: 'L1', text: '2+2?', options: ['3', '4', '', ''], answer: 2 })
  })

  it('builds the report row expected by the existing table', () => {
    expect(studentReport({ name: 'Ada', class: 'P5' }, { score: 8, status: 'Passed', updatedAt: 'today' }, 10))
      .toEqual({ timestamp: 'today', name: 'Ada', class: 'P5', totalQuestions: 10, score: 8, status: 'Passed' })
  })
})
