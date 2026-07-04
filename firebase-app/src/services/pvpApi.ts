import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { db, ensureSignedIn } from '../firebase/client'
import { canJoinWaitingMatch, finishPlayer, matchResponse, setReady, updateHp, type MatchState } from './pvpLogic'
import type { FirebaseServices } from './legacyRunner'

type MatchData = Record<string, unknown>

const asMatch = (id: string, value: MatchData): MatchState => ({
  ...value,
  matchId: id,
  p1Id: String(value.p1Id || ''),
  p2Id: value.p2Id ? String(value.p2Id) : null,
  p1Name: String(value.p1Name || ''),
  p2Name: String(value.p2Name || ''),
  p1Avatar: String(value.p1Avatar || ''),
  p2Avatar: String(value.p2Avatar || ''),
  p1Hp: Number(value.p1Hp) || 0,
  p2Hp: Number(value.p2Hp) || 0,
  p1Ready: value.p1Ready === 'FINISHED' ? 'FINISHED' : value.p1Ready === true,
  p2Ready: value.p2Ready === 'FINISHED' ? 'FINISHED' : value.p2Ready === true,
  status: String(value.status || 'WAITING'),
})

const ownsStudent = async (userId: string) => {
  const identity = await ensureSignedIn()
  const student = await getDoc(doc(db, 'users', userId))
  if (!student.exists() || student.data().ownerUid !== identity.uid) throw new Error('This student profile belongs to another session')
  return identity
}

async function createOrJoinMatch(rawUserId: unknown, rawName: unknown, rawAvatar: unknown, rawRoomCode?: unknown) {
  const userId = String(rawUserId || '')
  const name = String(rawName || '')
  const avatar = String(rawAvatar || '')
  const roomCode = String(rawRoomCode || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 20)
  const identity = await ownsStudent(userId)
  const createMatch = (matchId: string): MatchState & MatchData => ({
    matchId,
    p1Id: userId,
    p1Uid: identity.uid,
    p2Id: null,
    p2Uid: null,
    p1Name: name,
    p2Name: '',
    p1Avatar: avatar,
    p2Avatar: '',
    p1Hp: 100,
    p2Hp: 100,
    p1Ready: false,
    p2Ready: false,
    status: 'WAITING',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  if (roomCode) {
    const target = doc(db, 'pvpMatches', `PRIVATE_${roomCode}`)
    return runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(target)
      if (!snapshot.exists()) {
        const created = createMatch(target.id)
        transaction.set(target, created)
        return { ...matchResponse(created), role: 'Player1' as const }
      }
      const match = asMatch(snapshot.id, snapshot.data())
      if (!canJoinWaitingMatch(match, userId)) throw new Error('ห้องนี้กำลังใช้งานหรือคุณอยู่ในห้องนี้แล้ว')
      const joined = {
        ...match, p2Id: userId, p2Uid: identity.uid, p2Name: name, p2Avatar: avatar,
        p2Ready: false, status: 'LOBBY', updatedAt: serverTimestamp(),
      }
      transaction.update(target, joined)
      return { ...matchResponse(joined), role: 'Player2' as const }
    })
  }

  let target: ReturnType<typeof doc> | undefined

  const waiting = await getDocs(query(collection(db, 'pvpMatches'), where('status', '==', 'WAITING'), limit(20)))
  const candidate = waiting.docs.find((row) => !row.id.startsWith('PRIVATE_') && row.data().p1Id !== userId)
  if (candidate) target = candidate.ref

  if (target) {
    const joined = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(target)
      if (!snapshot.exists()) return null
      const match = asMatch(snapshot.id, snapshot.data())
      if (!canJoinWaitingMatch(match, userId)) return null
      const next = {
        ...match, p2Id: userId, p2Uid: identity.uid, p2Name: name, p2Avatar: avatar,
        p2Ready: false, status: 'LOBBY', updatedAt: serverTimestamp(),
      }
      transaction.update(target, next)
      return next
    })
    if (joined) return { ...matchResponse(joined), role: 'Player2' }
  }

  const ref = doc(collection(db, 'pvpMatches'))
  const match = createMatch(ref.id)
  await setDoc(ref, match)
  return { ...matchResponse(match), role: 'Player1' }
}

async function getMatchStatus(rawMatchId: unknown) {
  await ensureSignedIn()
  const snapshot = await getDoc(doc(db, 'pvpMatches', String(rawMatchId || '')))
  if (!snapshot.exists()) return { success: false, error: 'Match not found' }
  return matchResponse(asMatch(snapshot.id, snapshot.data()))
}

export function subscribeToMatch(
  rawMatchId: unknown,
  onData: (data: ReturnType<typeof matchResponse>) => void,
  onError: (error: Error) => void,
) {
  const ref = doc(db, 'pvpMatches', String(rawMatchId || ''))
  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        onError(new Error('Match not found'))
        return
      }
      onData(matchResponse(asMatch(snapshot.id, snapshot.data())))
    },
    onError,
  )
}

async function updateMatchScore(rawMatchId: unknown, rawUserId: unknown, rawHp: unknown) {
  const userId = String(rawUserId || '')
  await ownsStudent(userId)
  const ref = doc(db, 'pvpMatches', String(rawMatchId || ''))
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) return { success: false, error: 'Match not found' }
    const next = updateHp(asMatch(snapshot.id, snapshot.data()), userId, Number(rawHp))
    transaction.update(ref, { p1Hp: next.p1Hp, p2Hp: next.p2Hp, status: next.status, updatedAt: serverTimestamp() })
    return { success: true, isGameOver: next.isGameOver, winner: next.winner, status: next.status }
  })
}

async function setPlayerReady(rawMatchId: unknown, rawUserId: unknown, rawReady: unknown) {
  const userId = String(rawUserId || '')
  await ownsStudent(userId)
  const ref = doc(db, 'pvpMatches', String(rawMatchId || ''))
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) return { success: false, error: 'Match not found' }
    const next = setReady(asMatch(snapshot.id, snapshot.data()), userId, Boolean(rawReady))
    transaction.update(ref, { p1Ready: next.p1Ready, p2Ready: next.p2Ready, status: next.status, updatedAt: serverTimestamp() })
    return matchResponse(next)
  })
}

async function finishMatch(rawMatchId: unknown, rawUserId: unknown) {
  const userId = String(rawUserId || '')
  await ownsStudent(userId)
  const ref = doc(db, 'pvpMatches', String(rawMatchId || ''))
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) return { success: false, error: 'Match not found' }
    const next = finishPlayer(asMatch(snapshot.id, snapshot.data()), userId)
    transaction.update(ref, { p1Ready: next.p1Ready, p2Ready: next.p2Ready, status: next.status, updatedAt: serverTimestamp() })
    return { success: true, p1Ready: next.p1Ready, p2Ready: next.p2Ready, status: next.status, p1Hp: next.p1Hp, p2Hp: next.p2Hp }
  })
}

async function leaveMatch(rawMatchId: unknown) {
  const identity = await ensureSignedIn()
  const ref = doc(db, 'pvpMatches', String(rawMatchId || ''))
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) return { success: false }
    const data = snapshot.data()
    if (data.p1Uid !== identity.uid && data.p2Uid !== identity.uid) throw new Error('Player is not part of this match')
    if (data.status !== 'FINISHED') transaction.update(ref, { status: 'CANCELLED', updatedAt: serverTimestamp() })
    return { success: true }
  })
}

export const pvpApi: FirebaseServices = {
  createOrJoinMatch,
  getMatchStatus,
  updateMatchScore,
  setPlayerReady,
  finishMatch,
  leaveMatch,
}
