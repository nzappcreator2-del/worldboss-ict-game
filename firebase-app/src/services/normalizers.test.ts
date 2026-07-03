import { describe, expect, it } from 'vitest'
import { normalizeUser, rankForXp } from './normalizers'

describe('rankForXp', () => {
  it.each([
    [0, 'BRONZE'], [299, 'BRONZE'], [300, 'SILVER'], [600, 'GOLD'],
    [1200, 'PLATINUM'], [2500, 'DIAMOND'], [5000, 'MASTER'], [10000, 'GRANDMASTER'],
  ])('maps %i XP to %s', (xp, rank) => expect(rankForXp(xp)).toBe(rank))
})

describe('normalizeUser', () => {
  it('fills safe defaults expected by the legacy UI', () => {
    expect(normalizeUser('u1', { name: 'Ada', class: 'ป.5' })).toMatchObject({
      id: 'u1', name: 'Ada', class: 'ป.5', xp: 0, level: 1, rank: 'BRONZE',
      avatar: '🧙‍♂️', coins: 0, streak: 0, inventory: { potion: 0, magnifier: 0 },
    })
  })
})
