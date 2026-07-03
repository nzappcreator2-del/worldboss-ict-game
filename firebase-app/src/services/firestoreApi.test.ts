import { describe, expect, it } from 'vitest'
import { claimLegacyUserData } from './firestoreApi'

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
