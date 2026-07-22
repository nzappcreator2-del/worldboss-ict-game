import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db, ensureSignedIn } from '../firebase/client'
import {
  applyDailyProgress,
  applyLoginBonus,
  buyCosmetic,
  buyInventoryItem,
  completeQuest,
  DAILY_QUEST_DEFAULTS,
  mergeDailyQuestConfig,
  pickGachaAvatar,
  resetDailyState,
  consumeInventoryItem,
  toggleCosmetic,
  worldBossResult,
  type Inventory,
} from './gameLogic'
import { sanitizePublicSettings } from './adminLogic'
import { allocateHeroStat } from './heroStats'
import { directoryEntry, normalizeCyberScenario, normalizeGender, normalizeUser, rankForXp } from './normalizers'
import { clampSessionReward, levelForXp } from './levelSystem'
import type { FirebaseServices } from './legacyRunner'
import { adminApi } from './adminApi'
import { aiApi } from './aiApi'
import { pvpApi } from './pvpApi'
import { WORLD_BOSS_CATALOG, findWorldBoss } from './worldBossCatalog'
import {
  WORKSHEET_FIRST_SUBMIT_COINS,
  WORKSHEET_FIRST_SUBMIT_XP,
  buildStudentQuestView,
  earnedQuestRewards,
  grantQuestRewards,
  normalizeTeacherQuest,
  questVisibleToStudent,
  studentQuestStatus,
  type EarnedQuestRewards,
  type StudentQuestContext,
  type TeacherQuestState,
} from './teacherQuestLogic'

type Data = Record<string, unknown>

export type ActiveNews = Data & {
  id?: string
  title: string
  content: string
  icon?: string
  type?: string
  date?: string
  updatedAtMs: number
}

export function claimLegacyUserData(data: Data, ownerUid: string, rawAvatar: unknown): Data {
  return {
    ...data,
    ownerUid,
    ...(data.avatar || !rawAvatar ? {} : { avatar: String(rawAvatar) }),
  }
}

const values = async (path: string) => {
  const snapshot = await getDocs(collection(db, path))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Data))
}

const questionRowsForLesson = async (lessonId: string) => {
  const snapshot = await getDocs(query(collection(db, 'questions'), where('lessonId', '==', lessonId)))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Data))
}

const questionCountsFor = async (lessonIds: string[]) => {
  const entries = await Promise.all(lessonIds.map(async (lessonId) => {
    const aggregate = await getCountFromServer(query(collection(db, 'questions'), where('lessonId', '==', lessonId)))
    return [lessonId, aggregate.data().count] as const
  }))
  return Object.fromEntries(entries)
}

const ownedUser = async (userId: unknown) => {
  const identity = await ensureSignedIn()
  const ref = doc(db, 'users', String(userId || ''))
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) throw new Error('User not found')
  if (snapshot.data().ownerUid !== identity.uid) throw new Error('This student profile belongs to another session')
  return { identity, ref, snapshot }
}

const DIRECTORY_MIRRORED_KEYS = ['name', 'class', 'avatar', 'xp', 'level', 'rank']

export const active = (value: unknown) => {
  if (value === false) return false
  const text = String(value ?? '').trim().toLowerCase()
  return text !== 'false' && text !== '0'
}

const newsTime = (item: Data) => {
  const timestamp = item.updatedAt as { toMillis?: () => number; seconds?: number } | undefined
  if (typeof timestamp?.toMillis === 'function') return timestamp.toMillis()
  if (typeof timestamp?.seconds === 'number') return timestamp.seconds * 1000
  if (typeof item.updatedAtMs === 'number') return item.updatedAtMs

  const date = String(item.date || '').trim()
  const thaiDate = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (thaiDate) {
    const year = Number(thaiDate[3]) > 2400 ? Number(thaiDate[3]) - 543 : Number(thaiDate[3])
    return Date.UTC(year, Number(thaiDate[2]) - 1, Number(thaiDate[1]))
  }
  const parsed = Date.parse(date)
  return Number.isFinite(parsed) ? parsed : 0
}

export function sortActiveNews(rows: Data[]): ActiveNews[] {
  return rows
    .filter((item) => active(item.isActive))
    .map((item): ActiveNews => ({
      ...item,
      id: String(item.id || item.newsId || ''),
      title: String(item.title || ''),
      content: String(item.content || ''),
      icon: String(item.icon || '📌'),
      type: String(item.type || 'NEWS'),
      date: String(item.date || ''),
      updatedAtMs: newsTime(item),
    }))
    .sort((a, b) => Number(b.updatedAtMs) - Number(a.updatedAtMs) || String(b.id || '').localeCompare(String(a.id || '')))
}
const todayThailand = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

async function mutateOwnedUser<T>(rawUserId: unknown, operation: (user: Data) => { result: T; update?: Data }): Promise<T> {
  const userId = String(rawUserId || '')
  const { ref } = await ownedUser(userId)
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    const user = snapshot.data() || {}
    const change = operation(user)
    if (change.update) {
      transaction.update(ref, change.update as Record<string, never>)
      if (DIRECTORY_MIRRORED_KEYS.some((key) => key in change.update!)) {
        transaction.set(doc(db, 'directory', userId), directoryEntry({ ...user, ...change.update }), { merge: true })
      }
    }
    return change.result
  })
}

const normalizeQuestion = (item: Data) => ({
  qId: String(item.qId || item.questionId || item.id || ''),
  text: String(item.text || item.questionText || ''),
  options: Array.isArray(item.options)
    ? item.options
    : [item.opt1, item.opt2, item.opt3, item.opt4],
  answer: item.pattern === 'choice' || !item.pattern
    ? Math.max(0, Number(item.answer ?? 1) - (item.answerIsZeroBased ? 0 : 1))
    // Matching questions never read `answer`, so a numeric fallback is safe
    // and keeps the QuizQuestion contract (answer: number) honest.
    : Number(item.answer) || 0,
  explanation: String(item.explanation || ''),
  pattern: String(item.pattern || item.questionPattern || 'choice'),
  image: String(item.image || item.questionImage || ''),
  matchingPairs: Array.isArray(item.matchingPairs) ? item.matchingPairs : [],
})

async function getRegisteredUsers() {
  await ensureSignedIn()
  const users = (await values('directory')).map((item) => ({
    name: String(item.name || ''), class: String(item.class || ''), avatar: String(item.avatar || '🧙‍♂️'),
  }))
  return { success: true, data: users }
}

async function getSettings() {
  await ensureSignedIn()
  const snapshot = await getDoc(doc(db, 'settings', 'public'))
  return {
    success: true,
    data: snapshot.exists()
      ? sanitizePublicSettings(snapshot.data())
      : { TimerPerQuestion: 30, Classes: 'ป.4,ป.5,ป.6' },
  }
}

async function getActiveNews() {
  await ensureSignedIn()
  return sortActiveNews(await values('news'))
}

export function subscribeActiveNews(onNews: (news: ActiveNews[]) => void, onError?: (error: Error) => void) {
  let cancelled = false
  let unsubscribe: (() => void) | undefined

  void ensureSignedIn().then(() => {
    if (cancelled) return
    unsubscribe = onSnapshot(collection(db, 'news'), (snapshot) => {
      if (!cancelled) onNews(sortActiveNews(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Data))))
    }, (error) => {
      if (!cancelled) onError?.(error)
    })
  }).catch((error: unknown) => {
    if (!cancelled) onError?.(error instanceof Error ? error : new Error(String(error)))
  })

  return () => {
    cancelled = true
    unsubscribe?.()
  }
}

export async function getInitialData() {
  const [users, settings, news] = await Promise.all([getRegisteredUsers(), getSettings(), getActiveNews()])
  return { success: true, users: users.data, settings: settings.data, news }
}

// Shape of a brand-new student document. Shared by first registration and by
// the stale-directory repair below so the two can never drift.
export function newStudentRecord(name: string, className: string, rawAvatar: unknown, rawGender: unknown, ownerUid: string) {
  const gender = normalizeGender(rawGender)
  return {
    name,
    class: className,
    avatar: String(rawAvatar || '🧙‍♂️'),
    // Gender is only written at registration; rules keep it immutable afterwards.
    ...(gender ? { gender } : {}),
    xp: 0,
    rank: 'BRONZE',
    level: 1,
    coins: 0,
    streak: 0,
    inventory: { potion: 0, magnifier: 0 },
    ownerUid,
    createdAt: serverTimestamp(),
    lastLogin: serverTimestamp(),
  }
}

export async function loginStudent(rawName: unknown, rawClass: unknown, rawAvatar: unknown, rawGender?: unknown) {
  const identity = await ensureSignedIn()
  const name = String(rawName || '').trim()
  const className = String(rawClass || '').trim()
  if (!name || !className) return { success: false, error: 'กรุณาระบุชื่อและชั้นเรียน' }

  // Existing profiles are located via the reduced public directory; full user
  // docs are only readable after the claim write succeeds (rules enforce the
  // ownership check server-side, so no pre-claim read is required).
  const found = await getDocs(query(collection(db, 'directory'), where('name', '==', name), where('class', '==', className), limit(1)))
  if (!found.empty) {
    const userId = found.docs[0].id
    const userRef = doc(db, 'users', userId)
    try {
      await updateDoc(userRef, { ownerUid: identity.uid, lastLogin: serverTimestamp() })
    } catch {
      // The claim failed for one of two very different reasons, and the rules
      // report both as permission-denied (a missing document has no
      // `resource.data` to test ownership against):
      //   1. the directory row is stale — its user document was deleted, e.g.
      //      by a wipe that removed `users` but not `directory`. The name would
      //      otherwise be unusable forever.
      //   2. the profile genuinely belongs to another device.
      // Re-creating the user document tells them apart: `create` succeeds only
      // when nothing is there, so case 2 is denied again and reports honestly.
      const repaired = newStudentRecord(name, className, rawAvatar, rawGender, identity.uid)
      try {
        await setDoc(userRef, repaired)
      } catch {
        return { success: false, error: 'โปรไฟล์นี้ถูกผูกกับอุปกรณ์หรือบัญชีอื่นแล้ว' }
      }
      await setDoc(doc(db, 'directory', userId), directoryEntry(repaired), { merge: true })
      return { success: true, user: normalizeUser(userId, repaired), isNew: true }
    }
    const snapshot = await getDoc(userRef)
    const data = snapshot.data() || {}
    const claimedUser = claimLegacyUserData(data, identity.uid, rawAvatar)
    if (claimedUser.avatar !== data.avatar) await updateDoc(userRef, { avatar: String(claimedUser.avatar) })
    await setDoc(doc(db, 'directory', userId), directoryEntry(claimedUser), { merge: true })
    return { success: true, user: normalizeUser(userId, claimedUser) }
  }

  const ref = doc(collection(db, 'users'))
  const record = newStudentRecord(name, className, rawAvatar, rawGender, identity.uid)
  await setDoc(ref, record)
  await setDoc(doc(db, 'directory', ref.id), directoryEntry(record))
  return { success: true, user: normalizeUser(ref.id, record), isNew: true }
}

async function getStudentProgress(rawUserId: unknown) {
  await ensureSignedIn()
  const rows = await getDocs(query(collection(db, 'progress'), where('userId', '==', String(rawUserId))))
  return {
    success: true,
    data: rows.docs.filter((item) => ['Passed', 'Completed'].includes(String(item.data().status))).map((item) => String(item.data().lessonId)),
  }
}

async function getLessons(rawUserId?: unknown) {
  await ensureSignedIn()
  const [lessonRows, progress] = await Promise.all([
    values('lessons'), rawUserId ? getStudentProgress(rawUserId) : Promise.resolve({ data: [] as string[] }),
  ])
  // Aggregation queries cost 1 read per 1000 index entries instead of
  // downloading the whole question bank on every map open.
  const counts = await questionCountsFor(lessonRows.map((item) => String(item.lessonId || item.id)))
  const lessons = lessonRows.map((item) => ({
    ...item,
    id: String(item.lessonId || item.id),
    title: String(item.title || ''),
    description: String(item.description || ''),
    videoUrl: String(item.videoUrl || ''),
    icon: String(item.icon || '🗺️'),
    isActive: active(item.isActive),
    enablePretest: item.enablePretest === true,
    worksheetUrl: String(item.worksheetUrl || ''),
    content: String(item.content || ''),
    mapStyle: String(item.mapStyle || ''),
    lessonMapSet: String(item.lessonMapSet || ''),
    questionCount: counts[String(item.lessonId || item.id)] || 0,
  }))
  return { success: true, data: lessons, passedLessons: progress.data }
}

async function questionsFor(rawLessonId: unknown, pretest: boolean) {
  await ensureSignedIn()
  const lessonId = String(rawLessonId || '')
  const rows = lessonId === 'PVP_MODE'
    ? await pvpQuestionRows()
    : await questionRowsForLesson(lessonId)
  const selected = selectQuestionsForLesson(rows, lessonId, pretest)
  return { success: true, data: selected.map(normalizeQuestion).slice(0, lessonId === 'PVP_MODE' ? 10 : undefined) }
}

async function pvpQuestionRows() {
  const dedicated = await questionRowsForLesson('PVP_MODE')
  if (selectQuestionsForLesson(dedicated, 'PVP_MODE', false).length >= 10) return dedicated
  // Not enough dedicated PVP questions: top the set up from the full bank.
  return values('questions')
}

export function selectQuestionsForLesson(rows: Data[], lessonId: string, pretest: boolean): Data[] {
  const selected = rows.filter((item) => {
    const isPretest = String(item.type || 'posttest').toLowerCase() === 'pretest'
    if (isPretest !== pretest) return false
    if (lessonId !== 'PVP_MODE') return String(item.lessonId) === lessonId
    return String(item.pattern || item.questionPattern || 'choice').toLowerCase() === 'choice'
  })
  if (lessonId !== 'PVP_MODE') return selected
  return [
    ...selected.filter((item) => String(item.lessonId) === 'PVP_MODE'),
    ...selected.filter((item) => String(item.lessonId) !== 'PVP_MODE'),
  ].slice(0, 10)
}

async function getQuestions(lessonId: unknown) {
  return questionsFor(lessonId, false)
}

async function getPreTestQuestions(lessonId: unknown) {
  return questionsFor(lessonId, true)
}

async function saveStudentProgress(rawUserId: unknown, rawLessonId: unknown, rawStatus: unknown, rawScore: unknown, rawMaxScore?: unknown) {
  const userId = String(rawUserId || '')
  const lessonId = String(rawLessonId || '')
  const { ref: userRef } = await ownedUser(userId)
  const progressRef = doc(db, 'progress', `${userId}_${lessonId}`)

  const stats = await runTransaction(db, async (transaction) => {
    const [userSnapshot, previousProgress] = await Promise.all([transaction.get(userRef), transaction.get(progressRef)])
    const user = userSnapshot.data() || {}
    const alreadyPassed = ['Passed', 'Completed'].includes(String(previousProgress.data()?.status || ''))
    const passedNow = ['Passed', 'Completed'].includes(String(rawStatus || ''))
    const score = Number(rawScore) || 0
    const maxScore = Number(rawMaxScore) || 0
    const gainedXp = passedNow && !alreadyPassed ? Math.max(10, score * 10) : 0
    const gainedCoins = passedNow && !alreadyPassed ? Math.max(5, score * 5) : 0
    const xp = Number(user.xp || 0) + gainedXp
    const coins = Number(user.coins || 0) + gainedCoins
    const level = levelForXp(xp)
    const rank = rankForXp(xp)

    transaction.set(progressRef, { userId, lessonId, status: String(rawStatus), score, maxScore, updatedAt: serverTimestamp() }, { merge: true })
    transaction.update(userRef, { xp, coins, level, rank })
    transaction.set(doc(db, 'directory', userId), directoryEntry({ ...user, xp, level, rank }), { merge: true })
    return { xp, coins, level, rank, gainedXp, alreadyPassed }
  })
  return { success: true, stats }
}

async function rankedUsers() {
  await ensureSignedIn()
  return (await values('directory')).map((item) => normalizeUser(String(item.id), item)).sort((a, b) => b.xp - a.xp)
}

async function getLeaderboard() {
  return { success: true, data: (await rankedUsers()).slice(0, 20) }
}

async function getGuildLeaderboard() {
  // Guild totals must aggregate every player, not just the visible top 20.
  const users = await rankedUsers()
  const guilds = Object.values(users.reduce<Record<string, { name: string; totalXp: number; memberCount: number }>>((all, user) => {
    const name = user.class || '-'
    all[name] ??= { name, totalXp: 0, memberCount: 0 }
    all[name].totalXp += user.xp
    all[name].memberCount += 1
    return all
  }, {})).sort((a, b) => b.totalXp - a.totalXp)
  return { success: true, data: guilds }
}

async function getCyberSafetyScenarios() {
  await ensureSignedIn()
  const scenarios = await values('cyberSafetyScenarios')
  return { success: true, data: scenarios.map((scenario) => normalizeCyberScenario(String(scenario.id || ''), scenario)) }
}

// Flush of field-combat rewards from the lesson adventure (monster-kill XP and
// picked-up coins). Deltas are clamped client-side well under the ±1000-per-write
// Firestore rules cap; level and rank are always recomputed server-shape-style
// from the new XP total so the user document never drifts from the curve.
async function saveAdventureRewards(rawUserId: unknown, rawXpGain: unknown, rawCoinGain: unknown) {
  const gain = clampSessionReward(Number(rawXpGain), Number(rawCoinGain))
  if (gain.xp <= 0 && gain.coins <= 0) return { success: true, skipped: true }
  return mutateOwnedUser(rawUserId, (user) => {
    const xp = (Number(user.xp) || 0) + gain.xp
    const coins = (Number(user.coins) || 0) + gain.coins
    const level = levelForXp(xp)
    const rank = rankForXp(xp)
    return {
      result: { success: true, stats: { xp, coins, level, rank, gainedXp: gain.xp, gainedCoins: gain.coins } },
      update: { xp, coins, level, rank },
    }
  })
}

// Cosmetic wardrobe: prices live in gameLogic.COSMETIC_CATALOG (all ≤ 950, under
// the rules' coin delta cap); ownership/equipped state sits in the inventory bag.
async function buyCosmeticItem(rawUserId: unknown, rawItemId: unknown) {
  return mutateOwnedUser<{ success: boolean; coins?: number; inventory?: Inventory; error?: string }>(rawUserId, (user) => {
    const outcome = buyCosmetic(Number(user.coins) || 0, (user.inventory as Inventory) || {}, String(rawItemId || ''), user.gender)
    if (!outcome.success) return { result: outcome }
    return {
      result: { success: true, coins: outcome.coins, inventory: outcome.inventory },
      update: { coins: outcome.coins, inventory: outcome.inventory },
    }
  })
}

async function equipCosmeticItem(rawUserId: unknown, rawItemId: unknown) {
  return mutateOwnedUser<{ success: boolean; equipped?: boolean; inventory?: Inventory; error?: string }>(rawUserId, (user) => {
    const outcome = toggleCosmetic((user.inventory as Inventory) || {}, String(rawItemId || ''), user.gender)
    if (!outcome.success) return { result: outcome }
    return {
      result: { success: true, equipped: outcome.equipped, inventory: outcome.inventory },
      update: { inventory: outcome.inventory },
    }
  })
}

const WORKSHEET_ANSWER_MAX_LENGTH = 1200
// The one-time study reward amounts are shared with the teacher-quest preview
// UI, so they live in teacherQuestLogic as the single source of truth.

// Worksheet submissions live in the user's own document under inventory.worksheets
// (the rules already treat `inventory` as a free-form player bag, so no rules
// change is needed). The first submission per lesson pays a study reward once.
async function saveWorksheetSubmission(rawUserId: unknown, rawLessonId: unknown, rawAnswer: unknown) {
  const lessonId = String(rawLessonId || '').trim()
  const answer = String(rawAnswer || '').trim().slice(0, WORKSHEET_ANSWER_MAX_LENGTH)
  if (!lessonId || !answer) return { success: false, error: 'ไม่พบบทเรียนหรือคำตอบสำหรับบันทึก' }
  return mutateOwnedUser(rawUserId, (user) => {
    const inventory = user.inventory && typeof user.inventory === 'object' ? { ...(user.inventory as Data) } : {}
    const worksheets = inventory.worksheets && typeof inventory.worksheets === 'object' ? { ...(inventory.worksheets as Data) } : {}
    const firstSubmission = !(lessonId in worksheets)
    worksheets[lessonId] = { answer, submittedAt: new Date().toISOString() }
    inventory.worksheets = worksheets
    const xp = (Number(user.xp) || 0) + (firstSubmission ? WORKSHEET_FIRST_SUBMIT_XP : 0)
    const coins = (Number(user.coins) || 0) + (firstSubmission ? WORKSHEET_FIRST_SUBMIT_COINS : 0)
    const level = levelForXp(xp)
    const rank = rankForXp(xp)
    return {
      result: {
        success: true,
        firstSubmission,
        stats: {
          xp, coins, level, rank,
          gainedXp: firstSubmission ? WORKSHEET_FIRST_SUBMIT_XP : 0,
          gainedCoins: firstSubmission ? WORKSHEET_FIRST_SUBMIT_COINS : 0,
        },
      },
      update: { inventory, xp, coins, level, rank },
    }
  })
}

// --- Teacher quests (ครูวีรภัทร์ NPC) ---------------------------------------
// Quest definitions are admin-owned documents in `teacherQuests`; every
// per-student stamp lives in the user's own inventory.teacherQuests bag so no
// new writable collection (and no rules relaxation) is needed. The NPC pays no
// rewards — worksheet/lesson flows keep their existing one-time payouts.

const questStatesOf = (user: Data): Record<string, TeacherQuestState> => {
  const inventory = user.inventory && typeof user.inventory === 'object' ? user.inventory as Data : {}
  const states = inventory.teacherQuests
  return states && typeof states === 'object' ? states as Record<string, TeacherQuestState> : {}
}

const questContextFor = (
  lessonId: string,
  state: TeacherQuestState | undefined,
  passedLessons: Set<string>,
  user: Data,
): StudentQuestContext => {
  const inventory = user.inventory && typeof user.inventory === 'object' ? user.inventory as Data : {}
  const worksheets = inventory.worksheets && typeof inventory.worksheets === 'object' ? inventory.worksheets as Data : {}
  return {
    state,
    lessonPassed: passedLessons.has(lessonId),
    worksheetSubmitted: lessonId in worksheets,
  }
}

// Students may only list non-draft quests (rules enforce this), so the query
// filter is part of the security contract, not just an optimization.
const studentQuestRows = async () => {
  const snapshot = await getDocs(query(collection(db, 'teacherQuests'), where('status', 'in', ['active', 'closed'])))
  return snapshot.docs.map((item) => normalizeTeacherQuest(item.id, item.data()))
}

async function getTeacherQuestBoard(rawUserId: unknown) {
  const userId = String(rawUserId || '')
  const { snapshot } = await ownedUser(userId)
  const user = snapshot.data() || {}
  const [quests, progress] = await Promise.all([studentQuestRows(), getStudentProgress(userId)])
  const today = todayThailand()
  const states = questStatesOf(user)
  const passed = new Set(progress.data)
  const data = quests
    .filter((quest) => questVisibleToStudent(quest, String(user.class || ''), today, Boolean(states[quest.questId])))
    .map((quest) => buildStudentQuestView(quest, questContextFor(quest.lessonId, states[quest.questId], passed, user), today))
  return { success: true, data }
}

// Idempotent acceptance stamp: re-accepting (double tap, refresh) never
// rewrites the original timestamp.
async function acceptTeacherQuest(rawUserId: unknown, rawQuestId: unknown) {
  const questId = String(rawQuestId || '')
  if (!questId) return { success: false, error: 'ไม่พบภารกิจนี้ในระบบ' }
  return mutateOwnedUser(rawUserId, (user) => {
    const states = { ...questStatesOf(user) }
    if (states[questId]?.acceptedAt) return { result: { success: true, alreadyAccepted: true } }
    states[questId] = { ...states[questId], acceptedAt: new Date().toISOString() }
    const inventory = { ...(user.inventory as Data || {}), teacherQuests: states }
    return { result: { success: true, alreadyAccepted: false }, update: { inventory } }
  })
}

// Called when the student actually opens a lesson: stamps `studiedAt` on every
// accepted, un-turned-in quest that points at it. This is where "ศึกษาบทเรียน"
// is earned — walking to the map is not studying.
async function markTeacherQuestStudiedForLesson(rawUserId: unknown, rawLessonId: unknown) {
  const lessonId = String(rawLessonId || '')
  if (!lessonId) return { success: true, stamped: 0 }
  const quests = await studentQuestRows()
  const questIds = quests.filter((quest) => quest.lessonId === lessonId).map((quest) => quest.questId)
  if (questIds.length === 0) return { success: true, stamped: 0 }
  return mutateOwnedUser(rawUserId, (user) => {
    const states = { ...questStatesOf(user) }
    const stamped: string[] = []
    for (const questId of questIds) {
      const state = states[questId]
      // Idempotent: only quests the student accepted and has not already
      // studied or handed in get a stamp.
      if (!state?.acceptedAt || state.studiedAt || state.turnedInAt) continue
      states[questId] = { ...state, studiedAt: new Date().toISOString() }
      stamped.push(questId)
    }
    if (stamped.length === 0) return { result: { success: true, stamped: 0 } }
    const inventory = { ...(user.inventory as Data || {}), teacherQuests: states }
    return { result: { success: true, stamped: stamped.length }, update: { inventory } }
  })
}

async function markTeacherQuestStudied(rawUserId: unknown, rawQuestId: unknown) {
  const questId = String(rawQuestId || '')
  if (!questId) return { success: false, error: 'ไม่พบภารกิจนี้ในระบบ' }
  return mutateOwnedUser(rawUserId, (user) => {
    const states = { ...questStatesOf(user) }
    const state = states[questId]
    if (!state?.acceptedAt || state.studiedAt) return { result: { success: true } }
    states[questId] = { ...state, studiedAt: new Date().toISOString() }
    const inventory = { ...(user.inventory as Data || {}), teacherQuests: states }
    return { result: { success: true }, update: { inventory } }
  })
}

type TurnInResult = {
  success: boolean
  alreadyTurnedIn?: boolean
  error?: string
  earned?: EarnedQuestRewards
  stats?: { xp: number; coins: number; level: number; rank: string; inventory: Data }
}

async function turnInTeacherQuest(rawUserId: unknown, rawQuestId: unknown) {
  const userId = String(rawUserId || '')
  const questId = String(rawQuestId || '')
  if (!questId) return { success: false, error: 'ไม่พบภารกิจนี้ในระบบ' }
  await ensureSignedIn()
  const questSnapshot = await getDoc(doc(db, 'teacherQuests', questId))
  if (!questSnapshot.exists()) return { success: false, error: 'ไม่พบภารกิจนี้ในระบบ กรุณาลองใหม่' }
  const quest = normalizeTeacherQuest(questId, questSnapshot.data())
  if (quest.status !== 'active') return { success: false, error: 'ภารกิจนี้ปิดรับงานแล้ว' }
  const progressSnapshot = await getDoc(doc(db, 'progress', `${userId}_${quest.lessonId}`))
  const lessonPassed = ['Passed', 'Completed'].includes(String(progressSnapshot.data()?.status || ''))
  const today = todayThailand()
  return mutateOwnedUser<TurnInResult>(userId, (user) => {
    const states = { ...questStatesOf(user) }
    const state = states[questId]
    // The turnedInAt stamp is the payout ledger: a quest already stamped never
    // pays again, no matter how many times the button is pressed.
    if (state?.turnedInAt) return { result: { success: true, alreadyTurnedIn: true } }
    if (!state?.acceptedAt) return { result: { success: false, error: 'ต้องรับภารกิจกับครูวีรภัทร์ก่อนจึงจะส่งงานได้' } }
    const context = questContextFor(quest.lessonId, state, new Set(lessonPassed ? [quest.lessonId] : []), user)
    if (studentQuestStatus(quest, context, today) !== 'READY_TO_TURN_IN') {
      return { result: { success: false, error: 'ยังทำภารกิจไม่ครบทุกเป้าหมาย ลองตรวจสอบรายละเอียดภารกิจอีกครั้งนะ' } }
    }
    states[questId] = { ...state, turnedInAt: new Date().toISOString() }

    // Quest rewards are paid here, once, on top of whatever the worksheet and
    // lesson flows already paid for the underlying work.
    const earned = earnedQuestRewards(quest.rewards, quest.dueAt, today)
    const granted = grantQuestRewards(user, earned)
    granted.inventory.teacherQuests = states
    return {
      result: {
        success: true,
        alreadyTurnedIn: false,
        earned,
        // inventory rides along so granted items/cosmetics/badges land in the
        // bag without a page refresh (updateBattleUser accepts an inventory).
        stats: {
          xp: granted.xp,
          coins: granted.coins,
          level: granted.level,
          rank: granted.rank,
          inventory: granted.inventory,
        },
      },
      update: {
        inventory: granted.inventory,
        xp: granted.xp,
        coins: granted.coins,
        level: granted.level,
        rank: granted.rank,
      },
    }
  })
}

async function saveCyberSafetyResult(rawUserId: unknown, rawScore: unknown, rawCoins: unknown, rawXp: unknown) {
  const userId = String(rawUserId || '')
  const { ref } = await ownedUser(userId)
  const result = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    const user = snapshot.data() || {}
    const coins = Number(user.coins || 0) + (Number(rawCoins) || 0)
    const xp = Number(user.xp || 0) + (Number(rawXp) || 0)
    const level = levelForXp(xp)
    const rank = rankForXp(xp)
    transaction.update(ref, { coins, xp, level, rank })
    transaction.set(doc(db, 'progress', `${userId}_CYBER_SAFETY`), {
      userId, lessonId: 'CYBER_SAFETY', status: 'Passed', score: Number(rawScore) || 0, updatedAt: serverTimestamp(),
    }, { merge: true })
    transaction.set(doc(db, 'directory', userId), directoryEntry({ ...user, xp, level, rank }), { merge: true })
    return { coins, xp, level, rank }
  })
  return { success: true, ...result }
}

async function claimLoginBonus(rawUserId: unknown) {
  return mutateOwnedUser(rawUserId, (user) => {
    const outcome = applyLoginBonus(user, todayThailand())
    if (!outcome.isNew) return { result: { success: true, ...outcome } }
    return {
      result: { success: true, ...outcome },
      update: {
        coins: outcome.totalCoins,
        streak: outcome.streak,
        inventory: outcome.inventory,
      },
    }
  })
}

// Student-facing daily-quest catalog: admin overrides from the `dailyQuests`
// collection merged over the code defaults; inactive quests drop out.
async function getDailyQuestConfig() {
  await ensureSignedIn()
  const questRows = await values('dailyQuests')
  const byId = new Map(questRows.map((row) => [String(row.questId || row.id), row]))
  const data = DAILY_QUEST_DEFAULTS
    .map((defaults) => mergeDailyQuestConfig(defaults, byId.get(defaults.id)))
    .filter((quest) => quest.isActive)
  return { success: true, data }
}

// Read-only: computes today's daily state for display but never persists it.
// The reset is redundant to persist here — resetDailyState is idempotent and
// every real mutation (applyLoginBonus, applyDailyProgress, completeQuest)
// resets stale daily state before writing. Persisting it used to race
// claimLoginBonus (both fire on nextgen:login-complete and both write
// `inventory` on the first login of a new day), producing a benign but noisy
// Firestore `failed-precondition` in the console. Dropping the write removes
// that contention entirely.
async function getDailyQuestStatus(rawUserId: unknown) {
  const { snapshot } = await ownedUser(rawUserId)
  const inventory = resetDailyState((snapshot.data().inventory as Inventory) || {}, todayThailand())
  return { success: true, progress: inventory.dailyProgress, done: inventory.dailyDone }
}

async function updateDailyProgress(rawUserId: unknown, rawQuestId: unknown, rawIncrement: unknown, rawExtraData?: unknown) {
  return mutateOwnedUser(rawUserId, (user) => {
    const outcome = applyDailyProgress(
      (user.inventory as Inventory) || {}, todayThailand(), String(rawQuestId || ''),
      Number(rawIncrement) || 0, rawExtraData === undefined ? undefined : String(rawExtraData),
    )
    return {
      result: { success: true, newProgress: outcome.newProgress, ...(outcome.status ? { status: outcome.status } : {}) },
      update: { inventory: outcome.inventory },
    }
  })
}

async function completeDailyQuest(rawUserId: unknown, rawQuestId: unknown, rawCoins: unknown, rawXp: unknown) {
  return mutateOwnedUser<{ success: boolean; error?: string; coins?: number; xp?: number; inventory?: Inventory }>(rawUserId, (user) => {
    const outcome = completeQuest(user, todayThailand(), String(rawQuestId || ''), Number(rawCoins) || 0, Number(rawXp) || 0)
    if (!outcome.success) return { result: outcome }
    const level = levelForXp(outcome.xp)
    return {
      result: { success: true, coins: outcome.coins, xp: outcome.xp, inventory: outcome.inventory },
      update: { coins: outcome.coins, xp: outcome.xp, level, rank: rankForXp(outcome.xp), inventory: outcome.inventory },
    }
  })
}

async function useItem(rawUserId: unknown, rawItemId: unknown) {
  return mutateOwnedUser(rawUserId, (user) => {
    const outcome = consumeInventoryItem((user.inventory as Inventory) || {}, String(rawItemId || ''))
    return { result: outcome, ...(outcome.success ? { update: { inventory: outcome.inventory } } : {}) }
  })
}

async function buyItem(rawUserId: unknown, rawItemId: unknown) {
  return mutateOwnedUser(rawUserId, (user) => {
    const outcome = buyInventoryItem(Number(user.coins) || 0, (user.inventory as Inventory) || {}, String(rawItemId || ''))
    return { result: outcome, ...(outcome.success ? { update: { coins: outcome.coins, inventory: outcome.inventory } } : {}) }
  })
}

async function allocateStatPoint(rawUserId: unknown, rawStatKey: unknown) {
  return mutateOwnedUser(rawUserId, (user) => {
    const outcome = allocateHeroStat(user, rawStatKey)
    return { result: outcome, ...(outcome.success ? { update: { inventory: outcome.inventory } } : {}) }
  })
}

async function gachaAvatar(rawUserId: unknown) {
  const selected = pickGachaAvatar()
  return mutateOwnedUser<{ success: boolean; error?: string; coins?: number; avatar?: string; rarity?: string; message?: string }>(rawUserId, (user) => {
    const coins = Number(user.coins) || 0
    if (coins < 500) return { result: { success: false, error: 'เหรียญไม่พอสุ่มกาชา!' } }
    const newCoins = coins - 500
    return {
      result: { success: true, coins: newCoins, avatar: selected.emoji, rarity: selected.rarity, message: 'ได้ตัวละครใหม่แล้ว!' },
      update: { coins: newCoins, avatar: selected.emoji },
    }
  })
}

async function getUserStats(rawUserId: unknown) {
  const userId = String(rawUserId || '')
  const [users, progressResult, lessonsResult] = await Promise.all([rankedUsers(), getStudentProgress(userId), getLessons()])
  const index = users.findIndex((user) => user.id === userId)
  const passed = new Set(progressResult.data)
  const activeLessons = lessonsResult.data.filter((lesson) => lesson.isActive)
  const current = activeLessons.find((lesson) => !passed.has(lesson.id))
  return {
    success: true,
    sequence: index < 0 ? '-' : index + 1,
    currentLesson: current?.title || (activeLessons.length ? 'เคลียร์ทุกด่านแล้ว!' : 'ยังไม่มีด่าน'),
  }
}

async function checkCertificateEligibility(rawUserId: unknown) {
  const userId = String(rawUserId || '')
  const [lessonsResult, progressResult] = await Promise.all([getLessons(), getStudentProgress(userId)])
  const activeIds = lessonsResult.data.filter((lesson) => lesson.isActive).map((lesson) => lesson.id)
  const passed = new Set(progressResult.data)
  const passedCount = activeIds.filter((id) => passed.has(id)).length
  const isEligible = activeIds.length > 0 && passedCount >= activeIds.length
  await mutateOwnedUser(userId, (user) => {
    const inventory = { ...((user.inventory as Inventory) || {}) }
    const badges = Array.isArray(inventory.badges) ? inventory.badges.map(String) : []
    const nextBadges = isEligible
      ? badges.includes('badge_cert') ? badges : [...badges, 'badge_cert']
      : badges.filter((badge) => badge !== 'badge_cert')
    // Skip the write entirely when nothing changed: this runs on every
    // certificate-tab visit and used to burn a write each time.
    if (nextBadges.length === badges.length && nextBadges.every((badge, index) => badge === badges[index])) {
      return { result: undefined }
    }
    return { result: undefined, update: { inventory: { ...inventory, badges: nextBadges } } }
  })
  return { success: true, isEligible, passedCount, totalActiveCount: activeIds.length }
}

async function getStudentProfileData(rawUserId: unknown) {
  const userId = String(rawUserId || '')
  await ensureSignedIn()
  const [userSnapshot, progressRows, lessonsResult] = await Promise.all([
    getDoc(doc(db, 'users', userId)),
    getDocs(query(collection(db, 'progress'), where('userId', '==', userId))),
    getLessons(),
  ])
  if (!userSnapshot.exists()) return { success: false, error: 'ไม่พบข้อมูลผู้ใช้ในระบบ' }
  const passed = new Set<string>()
  let totalScore = 0
  progressRows.docs.forEach((row) => {
    const data = row.data()
    if (['Passed', 'Completed'].includes(String(data.status))) passed.add(String(data.lessonId))
    totalScore += Number(data.score) || 0
  })
  const totalLessons = lessonsResult.data.length
  return {
    success: true,
    profile: {
      ...normalizeUser(userSnapshot.id, userSnapshot.data()),
      stats: {
        completedLessons: passed.size,
        totalLessons,
        totalScore,
        completionRate: totalLessons ? Math.round((passed.size / totalLessons) * 100) : 0,
      },
    },
  }
}

async function getWorldBossConfig() {
  // The mini-game stages are a fixed in-code playset (see worldBossCatalog):
  // the admin-configurable worldBossConfig collection was retired. Auth is
  // still warmed here so the follow-up leaderboard/score calls are ready.
  await ensureSignedIn()
  return { success: true, data: WORLD_BOSS_CATALOG.map((boss) => ({ ...boss })) }
}

async function submitWorldBossScore(rawUserId: unknown, rawBossId: unknown, rawScore: unknown, rawBonusCoins: unknown) {
  const userId = String(rawUserId || '')
  const bossId = String(rawBossId || '')
  const { ref: userRef } = await ownedUser(userId)
  const boss = findWorldBoss(bossId)
  if (!boss) return { success: false, error: 'ไม่พบบอสที่เปิดใช้งาน' }
  const scoreRef = doc(db, 'worldBossScores', `${userId}_${bossId}`)
  return runTransaction(db, async (transaction) => {
    const [userSnapshot, scoreSnapshot] = await Promise.all([
      transaction.get(userRef), transaction.get(scoreRef),
    ])
    const user = userSnapshot.data() || {}
    const previous = scoreSnapshot.exists() ? Number(scoreSnapshot.data().bestTime ?? scoreSnapshot.data().bestScore) : null
    const score = worldBossResult(bossId, Number(rawScore), previous)
    // Full boss rewards only on a personal best; replays still keep the small
    // capped in-game bonus so grinding cannot mint unlimited coins/XP.
    const rewardCoins = score.isPersonalBest ? boss.rewardCoins : 0
    const rewardXp = score.isPersonalBest ? boss.rewardXp : 0
    const bonusCoins = Math.min(200, Math.max(0, Number(rawBonusCoins) || 0))
    const newCoins = (Number(user.coins) || 0) + rewardCoins + bonusCoins
    const newXp = (Number(user.xp) || 0) + rewardXp
    const level = levelForXp(newXp)
    const rank = rankForXp(newXp)
    if (score.isPersonalBest) {
      transaction.set(scoreRef, {
        userId, bossId, name: String(user.name || ''), className: String(user.class || ''), bestTime: score.bestScore,
        date: todayThailand(), ownerUid: String(user.ownerUid || ''), updatedAt: serverTimestamp(),
      }, { merge: true })
    }
    if (rewardCoins + rewardXp + bonusCoins > 0) {
      transaction.update(userRef, { coins: newCoins, xp: newXp, level, rank })
      transaction.set(doc(db, 'directory', userId), directoryEntry({ ...user, xp: newXp, level, rank }), { merge: true })
    }
    return {
      success: true, isPersonalBest: score.isPersonalBest, previousBest: previous,
      bestTime: score.bestScore, rewardCoins, rewardXp, newCoins, newXp, level, rank,
      bossName: boss.name,
    }
  })
}

async function getWorldBossLeaderboard(rawBossId: unknown) {
  await ensureSignedIn()
  const bossId = String(rawBossId || '')
  const rows = await getDocs(query(collection(db, 'worldBossScores'), where('bossId', '==', bossId)))
  const timeBased = bossId !== 'WB003' && (!bossId.startsWith('WB002') || bossId === 'WB002_SPEEDRUN')
  const data = rows.docs.map((row) => {
    const value = row.data()
    return {
      userId: String(value.userId || ''), name: String(value.name || ''), className: String(value.className || value.class || ''),
      bestTime: Number(value.bestTime ?? value.bestScore) || (timeBased ? 9999 : 0), date: String(value.date || ''),
    }
  }).sort((a, b) => timeBased ? a.bestTime - b.bestTime : b.bestTime - a.bestTime).slice(0, 10)
  return { success: true, data }
}

async function getScriptUrl() {
  return window.location.origin + window.location.pathname
}

export const firestoreApi = {
  ...aiApi,
  ...adminApi,
  ...pvpApi,
  getScriptUrl,
  getInitialData,
  getRegisteredUsers,
  getSettings,
  getActiveNews,
  loginStudent,
  getLessons,
  getQuestions,
  getPreTestQuestions,
  saveStudentProgress,
  saveAdventureRewards,
  saveWorksheetSubmission,
  getTeacherQuestBoard,
  acceptTeacherQuest,
  markTeacherQuestStudied,
  markTeacherQuestStudiedForLesson,
  turnInTeacherQuest,
  getStudentProgress,
  getLeaderboard,
  getGuildLeaderboard,
  getCyberSafetyScenarios,
  saveCyberSafetyResult,
  claimLoginBonus,
  getDailyQuestConfig,
  getDailyQuestStatus,
  updateDailyProgress,
  completeDailyQuest,
  useItem,
  buyItem,
  buyCosmeticItem,
  equipCosmeticItem,
  allocateStatPoint,
  gachaAvatar,
  getUserStats,
  checkCertificateEligibility,
  getStudentProfileData,
  getWorldBossConfig,
  submitWorldBossScore,
  getWorldBossLeaderboard,
} satisfies FirebaseServices
