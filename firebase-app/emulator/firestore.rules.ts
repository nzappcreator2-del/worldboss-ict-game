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

  it('lets signed-in players read the AI config but reserves writes for the admin', async () => {
    await seed('settings/ai', { geminiApiKey: 'runtime-key' })
    const guest = environment.unauthenticatedContext().firestore()
    const player = environment.authenticatedContext('player-1').firestore()
    const admin = environment.authenticatedContext('admin-1', { email: 'admin@nextgen-play.local' }).firestore()

    await assertFails(getDoc(doc(guest, 'settings/ai')))
    await assertSucceeds(getDoc(doc(player, 'settings/ai')))
    await assertFails(setDoc(doc(player, 'settings/ai'), { geminiApiKey: 'stolen' }))
    await assertSucceeds(setDoc(doc(admin, 'settings/ai'), { geminiApiKey: 'rotated-key' }))
    // Other settings documents stay admin-only in both directions.
    await assertFails(getDoc(doc(player, 'settings/secure')))
  })

  it('allows a player to create only a zeroed profile owned by their auth session', async () => {
    const player = environment.authenticatedContext('player-1').firestore()

    await assertSucceeds(setDoc(doc(player, 'users/U1'), student('player-1', 'U1')))
    await assertFails(setDoc(doc(player, 'users/U2'), student('another-player', 'U2')))
    await assertFails(setDoc(doc(player, 'users/U3'), { ...student('player-1', 'U3'), xp: 999 }))
  })

  it('accepts a valid registration gender but keeps it immutable afterwards', async () => {
    const player = environment.authenticatedContext('player-1').firestore()

    await assertSucceeds(setDoc(doc(player, 'users/U1'), { ...student('player-1', 'U1'), gender: 'male' }))
    await assertSucceeds(setDoc(doc(player, 'users/U2'), { ...student('player-1', 'U2'), gender: 'female' }))
    await assertFails(setDoc(doc(player, 'users/U3'), { ...student('player-1', 'U3'), gender: 'dragon' }))
    await assertFails(updateDoc(doc(player, 'users/U1'), { gender: 'female' }))
    // Untouched gender must not block normal owner updates.
    await assertSucceeds(updateDoc(doc(player, 'users/U1'), { xp: 100 }))
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

  it('allows creating, joining, and playing a renovated pvpRooms lobby while blocking outsiders', async () => {
    await seed('users/U1', student('player-1', 'U1'))
    await seed('users/U2', student('player-2', 'U2'))
    const playerOne = environment.authenticatedContext('player-1').firestore()
    const playerTwo = environment.authenticatedContext('player-2').firestore()
    const playerThree = environment.authenticatedContext('player-3').firestore()
    const hostEntry = {
      uid: 'player-1', name: 'One', avatar: '🧙‍♂️', gender: 'male', equipped: {}, level: 1,
      stats: { str: 0, vit: 0, dex: 0, luk: 0 }, team: 0, ready: false, hp: 100, maxHp: 100,
      damageDealt: 0, kills: 0, answersWon: 0,
    }
    const room = {
      roomId: 'PRIVATE_ABCD', mode: 'team', teamSize: 2, isPrivate: true,
      hostId: 'U1', hostUid: 'player-1', status: 'LOBBY', memberUids: ['player-1'],
      players: { U1: hostEntry }, battle: null, winnerTeam: null,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }

    await assertSucceeds(setDoc(doc(playerOne, 'pvpRooms/PRIVATE_ABCD'), room))
    // A stranger cannot create a room for someone else's student profile.
    await assertFails(setDoc(doc(playerThree, 'pvpRooms/PRIVATE_XYZ1'), { ...room, roomId: 'PRIVATE_XYZ1' }))

    const joinerEntry = { ...hostEntry, uid: 'player-2', name: 'Two', team: 1 }
    // Joining may only append your own uid to memberUids.
    await assertFails(updateDoc(doc(playerTwo, 'pvpRooms/PRIVATE_ABCD'), {
      players: { U1: hostEntry, U2: joinerEntry }, memberUids: ['player-1', 'player-9'], updatedAt: serverTimestamp(),
    }))
    await assertSucceeds(updateDoc(doc(playerTwo, 'pvpRooms/PRIVATE_ABCD'), {
      players: { U1: hostEntry, U2: joinerEntry }, memberUids: ['player-1', 'player-2'], updatedAt: serverTimestamp(),
    }))

    // Members mutate the shared battle state; outsiders are rejected.
    await assertSucceeds(updateDoc(doc(playerTwo, 'pvpRooms/PRIVATE_ABCD'), {
      players: { U1: { ...hostEntry, ready: true }, U2: { ...joinerEntry, ready: true } },
      status: 'PLAYING',
      battle: { round: 1, questionIds: ['q1'], lastAction: null, roundStartAt: serverTimestamp() },
      updatedAt: serverTimestamp(),
    }))
    await assertFails(updateDoc(doc(playerThree, 'pvpRooms/PRIVATE_ABCD'), { status: 'CANCELLED', updatedAt: serverTimestamp() }))
    // Only the host may resize teams.
    await assertFails(updateDoc(doc(playerTwo, 'pvpRooms/PRIVATE_ABCD'), { teamSize: 3, updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(playerOne, 'pvpRooms/PRIVATE_ABCD'), { teamSize: 3, updatedAt: serverTimestamp() }))
  })

  it('limits pvp room chat and presence writes to the author', async () => {
    await seed('users/U1', student('player-1', 'U1'))
    await seed('pvpRooms/R1', {
      roomId: 'R1', mode: 'duel', teamSize: 1, isPrivate: false, hostId: 'U1', hostUid: 'player-1',
      status: 'LOBBY', memberUids: ['player-1'], players: {}, battle: null, winnerTeam: null,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    const playerOne = environment.authenticatedContext('player-1').firestore()

    await assertSucceeds(setDoc(doc(playerOne, 'pvpRooms/R1/chat/C1'), {
      uid: 'player-1', userId: 'U1', name: 'One', text: 'สวัสดี', createdAt: serverTimestamp(),
    }))
    await assertFails(setDoc(doc(playerOne, 'pvpRooms/R1/chat/C2'), {
      uid: 'player-9', userId: 'U1', name: 'One', text: 'ปลอมตัว', createdAt: serverTimestamp(),
    }))
    await assertFails(setDoc(doc(playerOne, 'pvpRooms/R1/chat/C3'), {
      uid: 'player-1', userId: 'U1', name: 'One', text: 'x'.repeat(201), createdAt: serverTimestamp(),
    }))

    await assertSucceeds(setDoc(doc(playerOne, 'pvpRooms/R1/presence/player-1'), {
      uid: 'player-1', userId: 'U1', x: 50, y: 60, direction: 'down', action: 'walk', updatedAt: serverTimestamp(),
    }))
    await assertFails(setDoc(doc(playerOne, 'pvpRooms/R1/presence/player-2'), {
      uid: 'player-2', userId: 'U2', x: 50, y: 60, direction: 'down', action: 'walk', updatedAt: serverTimestamp(),
    }))
    await assertFails(setDoc(doc(playerOne, 'pvpRooms/R1/presence/player-1'), {
      uid: 'player-1', userId: 'U1', x: 500, y: 60, direction: 'down', action: 'walk', updatedAt: serverTimestamp(),
    }))
  })

  it('bounds pvp ranking writes to one match per update on your own ladder row', async () => {
    await seed('users/U1', student('player-1', 'U1'))
    const playerOne = environment.authenticatedContext('player-1').firestore()
    const playerTwo = environment.authenticatedContext('player-2').firestore()
    const row = {
      userId: 'U1', name: 'One', avatar: '🧙‍♂️', level: 1, class: 'ป.5',
      wins: 1, losses: 0, rating: 25, matches: 1, updatedAt: serverTimestamp(),
    }

    await assertFails(setDoc(doc(playerTwo, 'pvpRankings/U1'), row))
    await assertFails(setDoc(doc(playerOne, 'pvpRankings/U1'), { ...row, rating: 500 }))
    await assertSucceeds(setDoc(doc(playerOne, 'pvpRankings/U1'), row))
    await assertFails(updateDoc(doc(playerOne, 'pvpRankings/U1'), { wins: 5, rating: 50, matches: 2, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(playerOne, 'pvpRankings/U1'), { wins: 2, rating: 200, matches: 2, updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(playerOne, 'pvpRankings/U1'), { wins: 2, rating: 50, matches: 2, updatedAt: serverTimestamp() }))
  })

  it('allows only an admin to delete student data', async () => {
    await seed('users/U1', student('player-1', 'U1'))
    const player = environment.authenticatedContext('player-1').firestore()
    const admin = environment.authenticatedContext('admin-1', { email: 'admin@nextgen-play.local' }).firestore()

    await assertFails(deleteDoc(doc(player, 'users/U1')))
    await assertSucceeds(deleteDoc(doc(admin, 'users/U1')))
  })

  it('hides full user documents from other players while keeping the owner and admin reads', async () => {
    await seed('users/U1', student('player-1', 'U1'))
    await seed('users/U2', student('player-2', 'U2'))
    const playerOne = environment.authenticatedContext('player-1').firestore()
    const admin = environment.authenticatedContext('admin-1', { email: 'admin@nextgen-play.local' }).firestore()

    await assertSucceeds(getDoc(doc(playerOne, 'users/U1')))
    await assertFails(getDoc(doc(playerOne, 'users/U2')))
    await assertSucceeds(getDoc(doc(admin, 'users/U2')))
  })

  it('exposes only the reduced directory profile to signed-in players', async () => {
    await seed('users/U1', student('player-1', 'U1'))
    await seed('directory/U1', { name: 'Student U1', class: 'ป.5', avatar: '🧙‍♂️', xp: 0, level: 1, rank: 'BRONZE', updatedAt: serverTimestamp() })
    const playerTwo = environment.authenticatedContext('player-2').firestore()
    const guest = environment.unauthenticatedContext().firestore()

    await assertSucceeds(getDoc(doc(playerTwo, 'directory/U1')))
    await assertFails(getDoc(doc(guest, 'directory/U1')))
    await assertFails(setDoc(doc(playerTwo, 'directory/U1'), { name: 'Hacked', class: 'ป.5', avatar: '😈', xp: 0, level: 1, rank: 'BRONZE', updatedAt: serverTimestamp() }))
  })

  it('lets the owner mirror their reduced directory entry but rejects extra fields', async () => {
    await seed('users/U1', student('player-1', 'U1'))
    const playerOne = environment.authenticatedContext('player-1').firestore()
    const entry = { name: 'Student U1', class: 'ป.5', avatar: '🧙‍♂️', xp: 100, level: 2, rank: 'BRONZE', updatedAt: serverTimestamp() }

    await assertSucceeds(setDoc(doc(playerOne, 'directory/U1'), entry))
    await assertFails(setDoc(doc(playerOne, 'directory/U1'), { ...entry, coins: 999 }))
  })

  it('bounds per-write XP and coin deltas for player-owned updates', async () => {
    await seed('users/U1', { ...student('player-1', 'U1'), xp: 500, coins: 500, level: 6 })
    const playerOne = environment.authenticatedContext('player-1').firestore()
    const admin = environment.authenticatedContext('admin-1', { email: 'admin@nextgen-play.local' }).firestore()

    await assertSucceeds(updateDoc(doc(playerOne, 'users/U1'), { xp: 1000, coins: 700, level: 11, rank: 'GOLD' }))
    await assertFails(updateDoc(doc(playerOne, 'users/U1'), { xp: 99999 }))
    await assertFails(updateDoc(doc(playerOne, 'users/U1'), { xp: 500 }))
    await assertFails(updateDoc(doc(playerOne, 'users/U1'), { coins: 99999 }))
    await assertFails(updateDoc(doc(playerOne, 'users/U1'), { streak: 50 }))
    await assertFails(updateDoc(doc(playerOne, 'users/U1'), { rank: 'CHEATER' }))
    await assertSucceeds(updateDoc(doc(admin, 'users/U1'), { xp: 99999 }))
  })

  it('reopens the one-shot claim after an admin unbinds the owner', async () => {
    await seed('users/U1', { ...student('player-1', 'U1'), ownerUid: null })
    const playerTwo = environment.authenticatedContext('player-2').firestore()

    await assertSucceeds(updateDoc(doc(playerTwo, 'users/U1'), { ownerUid: 'player-2', lastLogin: serverTimestamp() }))
    const playerThree = environment.authenticatedContext('player-3').firestore()
    await assertFails(updateDoc(doc(playerThree, 'users/U1'), { ownerUid: 'player-3' }))
  })

  it('accepts bounded client error reports but reserves reads for the admin', async () => {
    const player = environment.authenticatedContext('player-1').firestore()
    const admin = environment.authenticatedContext('admin-1', { email: 'admin@nextgen-play.local' }).firestore()
    const report = { message: 'TypeError: boom', stack: 'at somewhere', source: 'window.onerror', userAgent: 'test-agent', createdAt: serverTimestamp() }

    await assertSucceeds(setDoc(doc(player, 'clientErrors/E1'), report))
    await assertFails(setDoc(doc(player, 'clientErrors/E2'), { ...report, message: 'x'.repeat(1001) }))
    await assertFails(getDoc(doc(player, 'clientErrors/E1')))
    await assertSucceeds(getDoc(doc(admin, 'clientErrors/E1')))
  })
})
