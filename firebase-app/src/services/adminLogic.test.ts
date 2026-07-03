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
