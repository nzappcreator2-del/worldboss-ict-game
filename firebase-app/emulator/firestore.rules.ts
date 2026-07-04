import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { deleteDoc, doc, getDoc, runTransaction, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

const projectId = 'nextgen-play-rules-test'
let environment: RulesTestEnvironment

const student = (uid: string, userId: string) => ({
  userId,
  name: `Student ${userId}`,
  class: 'ป.5',
  avatar: '🧙‍♂️',
  xp: 0,
  rank: 'BRONZE',
  level: 1,
  coins: 0,
  streak: 0,
  inventory: { potion: 0, magnifier: 0 },
  ownerUid: uid,
  createdAt: serverTimestamp(),
  lastLogin: '2026-07-03',
})

async function seed(path: string, data: Record<string, unknown>) {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data)
  })
}

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync(resolve('..', 'firestore.rules'), 'utf8') },
  })
})

beforeEach(async () => environment.clearFirestore())
afterAll(async () => environment.cleanup())

describe('Firestore security rules in the emulator', () => {
  it('requires authentication for public settings reads and reserves content writes for admins', async () => {
    await seed('settings/public', { TimerPerQuestion: 30 })
    const guest = environment.unauthenticatedContext().firestore()
    const player = environment.authenticatedContext('player-1').firestore()
    const admin = environment.authenticatedContext('admin-1', { email: 'admin@nextgen-play.local' }).firestore()

    await assertFails(getDoc(doc(guest, 'settings/public')))
    await assertSucceeds(getDoc(doc(player, 'settings/public')))
    await assertFails(setDoc(doc(player, 'lessons/L1'), { title: 'Forbidden' }))
    await assertSucceeds(setDoc(doc(admin, 'lessons/L1'), { title: 'Admin lesson' }))
  })

  it('allows a player to create only a zeroed profile owned by their auth session', async () => {
    const player = environment.authenticatedContext('player-1').firestore()

    await assertSucceeds(setDoc(doc(player, 'users/U1'), student('player-1', 'U1')))
    await assertFails(setDoc(doc(player, 'users/U2'), student('another-player', 'U2')))
    await assertFails(setDoc(doc(player, 'users/U3'), { ...student('player-1', 'U3'), xp: 999 }))
  })

  it('isolates progress writes to the owner and enforces the canonical progress id', async () => {
    await seed('users/U1', student('player-1', 'U1'))
    await seed('users/U2', student('player-2', 'U2'))
    await seed('progress/U2_L1', { userId: 'U2', lessonId: 'L1', status: 'Passed', score: 10, maxScore: 10, updatedAt: serverTimestamp() })
    const player = environment.authenticatedContext('player-1').firestore()
    const guest = environment.unauthenticatedContext().firestore()
    const progress = { userId: 'U1', lessonId: 'L1', status: 'Passed', score: 8, maxScore: 10, updatedAt: serverTimestamp() }

    await assertFails(getDoc(doc(guest, 'progress/missing')))
    await assertFails(getDoc(doc(player, 'progress/U2_L1')))
    await assertSucceeds(setDoc(doc(player, 'progress/U1_L1'), progress))
    await assertFails(setDoc(doc(player, 'progress/wrong-id'), progress))
    await assertFails(setDoc(doc(player, 'progress/U2_L1'), { ...progress, userId: 'U2' }))
  })

  it('allows the Battle transaction to save progress and reward the owning player atomically', async () => {
    await seed('users/U1', student('player-1', 'U1'))
    const player = environment.authenticatedContext('player-1').firestore()
    const userRef = doc(player, 'users/U1')
    const progressRef = doc(player, 'progress/U1_L1')

    await assertSucceeds(runTransaction(player, async (transaction) => {
      await Promise.all([transaction.get(userRef), transaction.get(progressRef)])
      transaction.set(progressRef, {
        userId: 'U1', lessonId: 'L1', status: 'Passed', score: 10, maxScore: 10, updatedAt: serverTimestamp(),
      }, { merge: true })
      transaction.update(userRef, { xp: 100, coins: 50, level: 2, rank: 'BRONZE' })
    }))
  })

  it('prevents one PVP player from changing the opponent HP', async () => {
    await seed('users/U1', student('player-1', 'U1'))
    await seed('users/U2', student('player-2', 'U2'))
    await seed('pvpMatches/M1', {
      matchId: 'M1', p1Uid: 'player-1', p2Uid: 'player-2', p1Id: 'U1', p2Id: 'U2',
      p1Name: 'One', p2Name: 'Two', p1Avatar: '🧙‍♂️', p2Avatar: '🧝‍♀️',
      p1Hp: 100, p2Hp: 100, p1Ready: true, p2Ready: true, status: 'PLAYING',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    const playerOne = environment.authenticatedContext('player-1').firestore()

    await assertSucceeds(updateDoc(doc(playerOne, 'pvpMatches/M1'), { p1Hp: 75, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(playerOne, 'pvpMatches/M1'), { p2Hp: 75, updatedAt: serverTimestamp() }))
  })

  it('allows two authenticated players to create, join, and ready a realtime PVP room', async () => {
    await seed('users/U1', student('player-1', 'U1'))
    await seed('users/U2', student('player-2', 'U2'))
    const playerOne = environment.authenticatedContext('player-1').firestore()
    const playerTwo = environment.authenticatedContext('player-2').firestore()
    const match = {
      matchId: 'PRIVATE_1234', p1Uid: 'player-1', p2Uid: null, p1Id: 'U1', p2Id: null,
      p1Name: 'One', p2Name: '', p1Avatar: '🧙‍♂️', p2Avatar: '',
      p1Hp: 100, p2Hp: 100, p1Ready: false, p2Ready: false, status: 'WAITING',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }

    await assertSucceeds(setDoc(doc(playerOne, 'pvpMatches/PRIVATE_1234'), match))
    await assertSucceeds(updateDoc(doc(playerTwo, 'pvpMatches/PRIVATE_1234'), {
      p2Uid: 'player-2', p2Id: 'U2', p2Name: 'Two', p2Avatar: '🧝‍♀️', status: 'LOBBY', updatedAt: serverTimestamp(),
    }))
    await assertSucceeds(updateDoc(doc(playerOne, 'pvpMatches/PRIVATE_1234'), { p1Ready: true, updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(playerTwo, 'pvpMatches/PRIVATE_1234'), { p2Ready: true, status: 'PLAYING', updatedAt: serverTimestamp() }))
  })

  it('allows a finished private room code to be reset but rejects replacing an active room', async () => {
    await seed('users/U1', student('player-1', 'U1'))
    await seed('users/U3', student('player-3', 'U3'))
    const playerThree = environment.authenticatedContext('player-3').firestore()
    const replacement = {
      matchId: 'PRIVATE_1234', p1Uid: 'player-3', p2Uid: null, p1Id: 'U3', p2Id: null,
      p1Name: 'Three', p2Name: '', p1Avatar: '⚔️', p2Avatar: '',
      p1Hp: 100, p2Hp: 100, p1Ready: false, p2Ready: false, status: 'WAITING',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }

    await seed('pvpMatches/PRIVATE_1234', {
      ...replacement, p1Uid: 'player-1', p1Id: 'U1', p1Name: 'One', status: 'FINISHED', p1Hp: 0,
    })
    await assertSucceeds(setDoc(doc(playerThree, 'pvpMatches/PRIVATE_1234'), replacement))

    await seed('pvpMatches/PRIVATE_5678', {
      ...replacement, matchId: 'PRIVATE_5678', p1Uid: 'player-1', p1Id: 'U1', p1Name: 'One', status: 'PLAYING',
      p1Ready: true, p2Ready: true,
    })
    await assertFails(setDoc(doc(playerThree, 'pvpMatches/PRIVATE_5678'), { ...replacement, matchId: 'PRIVATE_5678' }))
  })

  it('allows only an admin to delete student data', async () => {
    await seed('users/U1', student('player-1', 'U1'))
    const player = environment.authenticatedContext('player-1').firestore()
    const admin = environment.authenticatedContext('admin-1', { email: 'admin@nextgen-play.local' }).firestore()

    await assertFails(deleteDoc(doc(player, 'users/U1')))
    await assertSucceeds(deleteDoc(doc(admin, 'users/U1')))
  })
})
