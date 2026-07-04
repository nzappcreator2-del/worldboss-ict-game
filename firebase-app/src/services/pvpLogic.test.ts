import { describe, expect, it } from 'vitest'
import { canJoinWaitingMatch, canReusePrivateRoom, finishPlayer, matchResponse, setReady, updateHp } from './pvpLogic'

const match = {
  matchId: 'M1', p1Id: 'U1', p2Id: 'U2', p1Name: 'A', p2Name: 'B',
  p1Avatar: 'A', p2Avatar: 'B', p1Hp: 100, p2Hp: 100,
  p1Ready: false, p2Ready: false, status: 'LOBBY',
}

describe('PVP state transitions', () => {
  it('starts only after both players are ready', () => {
    expect(setReady(match, 'U1', true)).toMatchObject({ p1Ready: true, status: 'LOBBY' })
    expect(setReady({ ...match, p1Ready: true }, 'U2', true)).toMatchObject({ p2Ready: true, status: 'PLAYING' })
  })

  it('finishes and selects the opponent when HP reaches zero', () => {
    expect(updateHp(match, 'U1', 0)).toMatchObject({ p1Hp: 0, status: 'FINISHED', winner: 'Player2', isGameOver: true })
  })

  it('finishes after both players report completion', () => {
    expect(finishPlayer({ ...match, p1Ready: 'FINISHED' }, 'U2')).toMatchObject({ p2Ready: 'FINISHED', status: 'FINISHED' })
  })

  it('returns the legacy response field names', () => {
    expect(matchResponse(match)).toMatchObject({ success: true, matchId: 'M1', p1Hp: 100, p2Hp: 100 })
  })

  it('allows only a different second player to join an empty waiting room', () => {
    const waiting = { ...match, p2Id: null, status: 'WAITING' }
    expect(canJoinWaitingMatch(waiting, 'U2')).toBe(true)
    expect(canJoinWaitingMatch(waiting, 'U1')).toBe(false)
    expect(canJoinWaitingMatch({ ...waiting, p2Id: 'U3' }, 'U2')).toBe(false)
    expect(canJoinWaitingMatch({ ...waiting, status: 'LOBBY' }, 'U2')).toBe(false)
  })

  it('reuses a private room only after the previous match is terminal', () => {
    expect(canReusePrivateRoom({ ...match, status: 'FINISHED' })).toBe(true)
    expect(canReusePrivateRoom({ ...match, status: 'CANCELLED' })).toBe(true)
    expect(canReusePrivateRoom({ ...match, status: 'WAITING' })).toBe(false)
    expect(canReusePrivateRoom({ ...match, status: 'LOBBY' })).toBe(false)
    expect(canReusePrivateRoom({ ...match, status: 'PLAYING' })).toBe(false)
  })
})
