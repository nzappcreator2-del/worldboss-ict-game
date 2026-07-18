// Firestore wiring for the renovated PVP arena (duel + team battles) in the
// pvpRooms / pvpRankings collections. Every game rule lives in
// components/pvpRoomLogic.ts; this module only moves sanctioned snapshots in
// and out of Firestore. The legacy 1v1 pvpMatches flow in pvpApi.ts stays
// untouched because the legacy script surface still calls it.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { db, ensureSignedIn } from '../firebase/client'
import {
  advanceRoundOnTimeout,
  applyRankingDelta,
  buildPvpPlayer,
  canJoinRoom,
  canStartBattle,
  joinRoom,
  leaveRoom,
  newRoom,
  pickTeamForJoin,
  rankingDelta,
  refereeId,
  resolveAnswer,
  sanitizeRoomCode,
  setRoomTeamSize,
  shuffleQuestionIds,
  startBattle,
  switchTeam,
  toggleRoomReady,
  validRoomCode,
  type PvpBattleAction,
  type PvpOutcome,
  type PvpPlayer,
  type PvpRoom,
  type PvpRoomMode,
  type PvpTeam,
} from '../components/pvpRoomLogic'

const ROOMS = 'pvpRooms'
const RANKINGS = 'pvpRankings'
const PRIVATE_PREFIX = 'PRIVATE_'
const ROOM_FRESH_MS = 10 * 60 * 1000

export type PvpRoomUser = {
  id: string
  name?: unknown
  avatar?: unknown
  gender?: unknown
  level?: unknown
  xp?: unknown
  class?: unknown
  inventory?: unknown
}

type Data = Record<string, unknown>

const toMillis = (value: unknown): number => {
  const stamp = value as { toMillis?: () => number } | undefined
  return stamp?.toMillis?.() ?? 0
}

export type PvpRoomView = PvpRoom & { roundStartAtMs: number; updatedAtMs: number }

export function normalizePvpRoom(id: string, data: Data): PvpRoomView {
  const rawPlayers = data.players && typeof data.players === 'object' ? data.players as Record<string, Data> : {}
  const players: Record<string, PvpPlayer> = {}
  for (const [userId, raw] of Object.entries(rawPlayers)) {
    players[userId] = {
      userId,
      uid: String(raw.uid || ''),
      name: String(raw.name || ''),
      avatar: String(raw.avatar || '🧙‍♂️'),
      gender: raw.gender === 'male' || raw.gender === 'female' ? raw.gender : '',
      equipped: raw.equipped && typeof raw.equipped === 'object' ? raw.equipped as PvpPlayer['equipped'] : {},
      level: Number(raw.level) || 1,
      stats: {
        str: Number((raw.stats as Data | undefined)?.str) || 0,
        vit: Number((raw.stats as Data | undefined)?.vit) || 0,
        dex: Number((raw.stats as Data | undefined)?.dex) || 0,
        luk: Number((raw.stats as Data | undefined)?.luk) || 0,
      },
      team: raw.team === 1 ? 1 : 0,
      ready: raw.ready === true,
      hp: Math.max(0, Number(raw.hp) || 0),
      maxHp: Math.max(1, Number(raw.maxHp) || 100),
      damageDealt: Number(raw.damageDealt) || 0,
      kills: Number(raw.kills) || 0,
      answersWon: Number(raw.answersWon) || 0,
    }
  }
  const rawBattle = data.battle && typeof data.battle === 'object' ? data.battle as Data : null
  return {
    roomId: id,
    mode: data.mode === 'team' ? 'team' : 'duel',
    teamSize: Math.min(4, Math.max(1, Number(data.teamSize) || 1)),
    isPrivate: data.isPrivate === true,
    hostId: String(data.hostId || ''),
    hostUid: String(data.hostUid || ''),
    status: ['LOBBY', 'PLAYING', 'FINISHED', 'CANCELLED'].includes(String(data.status)) ? String(data.status) as PvpRoom['status'] : 'LOBBY',
    memberUids: Array.isArray(data.memberUids) ? data.memberUids.map(String) : [],
    players,
    battle: rawBattle
      ? {
        round: Math.max(1, Number(rawBattle.round) || 1),
        questionIds: Array.isArray(rawBattle.questionIds) ? rawBattle.questionIds.map(String) : [],
        lastAction: rawBattle.lastAction && typeof rawBattle.lastAction === 'object'
          ? rawBattle.lastAction as PvpBattleAction
          : null,
      }
      : null,
    winnerTeam: data.winnerTeam === 0 || data.winnerTeam === 1 ? data.winnerTeam as PvpTeam : null,
    roundStartAtMs: toMillis(rawBattle?.roundStartAt),
    updatedAtMs: toMillis(data.updatedAt),
  }
}

const ownsStudent = async (userId: string) => {
  const identity = await ensureSignedIn()
  const student = await getDoc(doc(db, 'users', userId))
  if (!student.exists() || student.data().ownerUid !== identity.uid) {
    throw new Error('This student profile belongs to another session')
  }
  return identity
}

const roomDocData = (room: PvpRoom): Data => {
  const rest: Data = { ...room }
  // View-only fields never belong in the stored document.
  delete rest.roundStartAtMs
  delete rest.updatedAtMs
  return { ...rest, updatedAt: serverTimestamp() }
}

const battleDocData = (room: PvpRoom): Data => ({
  players: room.players,
  status: room.status,
  winnerTeam: room.winnerTeam,
  battle: room.battle ? { ...room.battle, roundStartAt: serverTimestamp() } : null,
  updatedAt: serverTimestamp(),
})

export type JoinRoomResult = { success: true; roomId: string } | { success: false; error: string }

async function createRoom(user: PvpRoomUser, mode: PvpRoomMode, teamSize: number, roomCode: string | null): Promise<JoinRoomResult> {
  const identity = await ownsStudent(user.id)
  const host = buildPvpPlayer(user, identity.uid, 0)
  const code = roomCode ? sanitizeRoomCode(roomCode) : ''
  if (roomCode !== null && !validRoomCode(code)) return { success: false, error: 'รหัสห้องต้องเป็นตัวอักษร/ตัวเลข 4-8 ตัว' }
  const isPrivate = code !== ''
  const ref = isPrivate ? doc(db, ROOMS, `${PRIVATE_PREFIX}${code}`) : doc(collection(db, ROOMS))
  const room = newRoom(ref.id, mode, teamSize, isPrivate, host)

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (snapshot.exists()) {
      const existing = normalizePvpRoom(snapshot.id, snapshot.data())
      const stale = Date.now() - existing.updatedAtMs > ROOM_FRESH_MS
      if (existing.status === 'LOBBY' && !stale) return { success: false as const, error: 'มีห้องนี้เปิดอยู่แล้ว ลองเข้าร่วมแทน' }
      if (existing.status === 'PLAYING' && !stale) return { success: false as const, error: 'ห้องนี้กำลังต่อสู้อยู่' }
    }
    transaction.set(ref, { ...roomDocData(room), createdAt: serverTimestamp() })
    return { success: true as const, roomId: ref.id }
  })
}

async function joinRoomById(user: PvpRoomUser, roomId: string): Promise<JoinRoomResult> {
  const identity = await ownsStudent(user.id)
  const ref = doc(db, ROOMS, roomId)
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) return { success: false as const, error: 'ไม่พบห้องนี้' }
    const room = normalizePvpRoom(snapshot.id, snapshot.data())
    if (room.players[user.id]) return { success: true as const, roomId: ref.id }
    if (!canJoinRoom(room, user.id)) return { success: false as const, error: 'ห้องเต็มหรือเริ่มเกมไปแล้ว' }
    const team = pickTeamForJoin(room)
    if (team === null) return { success: false as const, error: 'ห้องเต็มแล้ว' }
    const next = joinRoom(room, buildPvpPlayer(user, identity.uid, team))
    if (!next) return { success: false as const, error: 'เข้าห้องไม่สำเร็จ' }
    transaction.update(ref, { players: next.players, memberUids: next.memberUids, updatedAt: serverTimestamp() })
    return { success: true as const, roomId: ref.id }
  })
}

// Single transaction covering every private-code outcome (create fresh,
// reclaim a finished/cancelled/abandoned code, join an open lobby, or
// reconnect a member who already holds a seat) so there is no read-then-write
// gap where a concurrent request could invalidate the decision.
export async function joinPrivateRoom(user: PvpRoomUser, mode: PvpRoomMode, teamSize: number, rawCode: string): Promise<JoinRoomResult> {
  const code = sanitizeRoomCode(rawCode)
  if (!validRoomCode(code)) return { success: false, error: 'รหัสห้องต้องเป็นตัวอักษร/ตัวเลข 4-8 ตัว' }
  const roomId = `${PRIVATE_PREFIX}${code}`
  const ref = doc(db, ROOMS, roomId)
  const identity = await ownsStudent(user.id)
  const host = buildPvpPlayer(user, identity.uid, 0)

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    const createFresh = () => {
      const room = newRoom(roomId, mode, teamSize, true, host)
      transaction.set(ref, { ...roomDocData(room), createdAt: serverTimestamp() })
      return { success: true as const, roomId }
    }
    if (!snapshot.exists()) return createFresh()

    const existing = normalizePvpRoom(snapshot.id, snapshot.data())
    const reusable = existing.status === 'FINISHED' || existing.status === 'CANCELLED'
      || Date.now() - existing.updatedAtMs > ROOM_FRESH_MS
    if (reusable) return createFresh()

    if (existing.status === 'LOBBY') {
      if (existing.players[user.id]) return { success: true as const, roomId }
      if (!canJoinRoom(existing, user.id)) return { success: false as const, error: 'ห้องเต็มแล้ว' }
      const team = pickTeamForJoin(existing)
      if (team === null) return { success: false as const, error: 'ห้องเต็มแล้ว' }
      const next = joinRoom(existing, buildPvpPlayer(user, identity.uid, team))
      if (!next) return { success: false as const, error: 'เข้าห้องไม่สำเร็จ' }
      transaction.update(ref, { players: next.players, memberUids: next.memberUids, updatedAt: serverTimestamp() })
      return { success: true as const, roomId }
    }

    // status === 'PLAYING': only an existing member may reconnect mid-battle.
    if (existing.players[user.id]) return { success: true as const, roomId }
    return { success: false as const, error: 'ห้องนี้กำลังต่อสู้อยู่' }
  })
}

// Public matchmaking: hop into the freshest open lobby of the same mode, or
// open a new public room when nobody is waiting.
export async function quickJoinRoom(user: PvpRoomUser, mode: PvpRoomMode, teamSize: number): Promise<JoinRoomResult> {
  await ensureSignedIn()
  const waiting = await getDocs(query(
    collection(db, ROOMS),
    where('status', '==', 'LOBBY'),
    where('isPrivate', '==', false),
    where('mode', '==', mode),
    limit(20),
  ))
  const candidates = waiting.docs
    .map((row) => normalizePvpRoom(row.id, row.data()))
    .filter((room) => canJoinRoom(room, user.id) && Date.now() - room.updatedAtMs < ROOM_FRESH_MS)
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
  for (const room of candidates) {
    const joined = await joinRoomById(user, room.roomId)
    if (joined.success) return joined
  }
  return createRoom(user, mode, teamSize, null)
}

export function subscribeToRoom(
  roomId: string,
  onData: (room: PvpRoomView) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, ROOMS, roomId),
    (snapshot) => {
      // A freshly attached listener can fire once from local cache before the
      // server responds — e.g. right after this client recreated/reused a
      // room, the cache may still hold the pre-write (CANCELLED) document.
      // Acting on that stale read would show a false "room cancelled" error
      // and tear down the subscription before the real data ever arrives, so
      // only server-confirmed snapshots are treated as authoritative here.
      if (snapshot.metadata.fromCache) return
      if (!snapshot.exists()) {
        onError(new Error('Room not found'))
        return
      }
      onData(normalizePvpRoom(snapshot.id, snapshot.data()))
    },
    onError,
  )
}

type MutateResult = { success: boolean; error?: string }

async function mutateRoom(roomId: string, operation: (room: PvpRoomView) => PvpRoom | null): Promise<MutateResult> {
  await ensureSignedIn()
  const ref = doc(db, ROOMS, roomId)
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) return { success: false, error: 'ไม่พบห้องนี้' }
    const next = operation(normalizePvpRoom(snapshot.id, snapshot.data()))
    if (!next) return { success: false, error: 'ทำรายการไม่สำเร็จ' }
    transaction.update(ref, roomDocData(next) as Record<string, never>)
    return { success: true }
  })
}

export async function leavePvpRoom(roomId: string, userId: string): Promise<MutateResult> {
  const result = await mutateRoom(roomId, (room) => {
    const next = leaveRoom(room, userId)
    return next === room ? null : next
  })
  const identity = await ensureSignedIn()
  await deleteDoc(doc(db, ROOMS, roomId, 'presence', identity.uid)).catch(() => undefined)
  return result
}

export async function setPvpReady(roomId: string, userId: string, ready: boolean): Promise<MutateResult> {
  return mutateRoom(roomId, (room) => {
    const next = toggleRoomReady(room, userId, ready)
    return next === room ? null : next
  })
}

export async function switchPvpTeam(roomId: string, userId: string): Promise<MutateResult> {
  return mutateRoom(roomId, (room) => switchTeam(room, userId))
}

export async function setPvpTeamSize(roomId: string, userId: string, size: number): Promise<MutateResult> {
  return mutateRoom(roomId, (room) => (room.hostId === userId ? setRoomTeamSize(room, size) : null))
}

export async function startPvpBattle(roomId: string, userId: string, questionIds: string[]): Promise<MutateResult> {
  await ensureSignedIn()
  const ref = doc(db, ROOMS, roomId)
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) return { success: false, error: 'ไม่พบห้องนี้' }
    const room = normalizePvpRoom(snapshot.id, snapshot.data())
    if (room.hostId !== userId) return { success: false, error: 'เฉพาะหัวหน้าห้องเท่านั้นที่เริ่มเกมได้' }
    const check = canStartBattle(room)
    if (!check.ok) return { success: false, error: check.reason }
    const shuffled = shuffleQuestionIds(questionIds, Math.random)
    if (shuffled.length === 0) return { success: false, error: 'ยังไม่มีคำถาม PVP ในระบบ' }
    transaction.update(ref, battleDocData(startBattle(room, shuffled)) as Record<string, never>)
    return { success: true }
  })
}

export type AnswerRoundResult = { success: boolean; struck?: boolean; error?: string }

// First correct answer wins the round: the transaction only lands if the round
// index still matches, so slower correct answers fall through harmlessly.
export async function answerPvpRound(roomId: string, userId: string, round: number): Promise<AnswerRoundResult> {
  await ensureSignedIn()
  const ref = doc(db, ROOMS, roomId)
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) return { success: false, error: 'ไม่พบห้องนี้' }
    const room = normalizePvpRoom(snapshot.id, snapshot.data())
    if (!room.battle || room.battle.round !== round) return { success: true, struck: false }
    const next = resolveAnswer(room, userId, Math.random)
    if (!next) return { success: true, struck: false }
    transaction.update(ref, battleDocData(next) as Record<string, never>)
    return { success: true, struck: true }
  })
}

export async function timeoutPvpRound(roomId: string, userId: string, round: number): Promise<MutateResult> {
  await ensureSignedIn()
  const ref = doc(db, ROOMS, roomId)
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) return { success: false, error: 'ไม่พบห้องนี้' }
    const room = normalizePvpRoom(snapshot.id, snapshot.data())
    if (!room.battle || room.battle.round !== round || refereeId(room) !== userId) return { success: true }
    const next = advanceRoundOnTimeout(room)
    if (!next) return { success: true }
    transaction.update(ref, battleDocData(next) as Record<string, never>)
    return { success: true }
  })
}

export type PvpChatMessage = { id: string; userId: string; name: string; text: string; createdAtMs: number }

export async function sendPvpChat(roomId: string, user: { id: string; name?: unknown }, rawText: unknown): Promise<MutateResult> {
  const identity = await ensureSignedIn()
  const text = String(rawText || '').trim().slice(0, 200)
  if (!text) return { success: false, error: 'ข้อความว่าง' }
  await addDoc(collection(db, ROOMS, roomId, 'chat'), {
    uid: identity.uid,
    userId: user.id,
    name: String(user.name || ''),
    text,
    createdAt: serverTimestamp(),
  })
  return { success: true }
}

export function subscribeToPvpChat(roomId: string, onData: (messages: PvpChatMessage[]) => void): () => void {
  const chatQuery = query(collection(db, ROOMS, roomId, 'chat'), orderBy('createdAt', 'desc'), limit(30))
  return onSnapshot(chatQuery, (snapshot) => {
    const messages = snapshot.docs.map((row) => {
      const data = row.data()
      return {
        id: row.id,
        userId: String(data.userId || ''),
        name: String(data.name || ''),
        text: String(data.text || ''),
        createdAtMs: toMillis(data.createdAt),
      }
    }).reverse()
    onData(messages)
  }, () => onData([]))
}

export type PvpPresence = { uid: string; userId: string; x: number; y: number; direction: string; action: string }

export async function updatePvpPresence(roomId: string, presence: { userId: string; x: number; y: number; direction: string; action: string }): Promise<void> {
  const identity = await ensureSignedIn()
  await setDoc(doc(db, ROOMS, roomId, 'presence', identity.uid), {
    uid: identity.uid,
    userId: presence.userId,
    x: Math.max(0, Math.min(100, Number(presence.x) || 0)),
    y: Math.max(0, Math.min(100, Number(presence.y) || 0)),
    direction: ['up', 'down', 'left', 'right'].includes(presence.direction) ? presence.direction : 'down',
    action: presence.action === 'walk' ? 'walk' : 'idle',
    updatedAt: serverTimestamp(),
  }).catch(() => undefined)
}

export function subscribeToPvpPresence(roomId: string, onData: (rows: PvpPresence[]) => void): () => void {
  return onSnapshot(collection(db, ROOMS, roomId, 'presence'), (snapshot) => {
    onData(snapshot.docs.map((row) => {
      const data = row.data()
      return {
        uid: row.id,
        userId: String(data.userId || ''),
        x: Number(data.x) || 0,
        y: Number(data.y) || 0,
        direction: String(data.direction || 'down'),
        action: String(data.action || 'idle'),
      }
    }))
  }, () => onData([]))
}

export type PvpRankingRow = {
  userId: string
  name: string
  avatar: string
  level: number
  class: string
  wins: number
  losses: number
  rating: number
  matches: number
}

export async function submitPvpRanking(
  user: { id: string; name?: unknown; avatar?: unknown; level?: unknown; class?: unknown },
  outcome: PvpOutcome,
): Promise<MutateResult> {
  await ownsStudent(user.id)
  const ref = doc(db, RANKINGS, user.id)
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    const next = applyRankingDelta(snapshot.exists() ? snapshot.data() : null, rankingDelta(outcome), {
      userId: user.id,
      name: String(user.name || ''),
      avatar: String(user.avatar || '🧙‍♂️'),
      level: Number(user.level) || 1,
      class: String(user.class || ''),
    })
    transaction.set(ref, { ...next, updatedAt: serverTimestamp() })
    return { success: true }
  })
}

export async function getPvpRankings(top = 10): Promise<{ success: boolean; data: PvpRankingRow[] }> {
  await ensureSignedIn()
  const rows = await getDocs(query(collection(db, RANKINGS), orderBy('rating', 'desc'), limit(top)))
  return {
    success: true,
    data: rows.docs.map((row) => {
      const data = row.data()
      return {
        userId: row.id,
        name: String(data.name || ''),
        avatar: String(data.avatar || '🧙‍♂️'),
        level: Number(data.level) || 1,
        class: String(data.class || ''),
        wins: Number(data.wins) || 0,
        losses: Number(data.losses) || 0,
        rating: Number(data.rating) || 0,
        matches: Number(data.matches) || 0,
      }
    }),
  }
}
