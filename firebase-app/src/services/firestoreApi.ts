import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
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
  buyInventoryItem,
  completeQuest,
  pickGachaAvatar,
  resetDailyState,
  consumeInventoryItem,
  worldBossResult,
  type Inventory,
} from './gameLogic'
import { sanitizePublicSettings } from './adminLogic'
import { normalizeUser, rankForXp } from './normalizers'
import type { FirebaseServices } from './legacyRunner'
import { adminApi } from './adminApi'
import { aiFallbackApi } from './aiFallbackApi'
import { pvpApi } from './pvpApi'

type Data = Record<string, unknown>

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

const ownedUser = async (userId: unknown) => {
  const identity = await ensureSignedIn()
  const ref = doc(db, 'users', String(userId || ''))
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) throw new Error('User not found')
  if (snapshot.data().ownerUid !== identity.uid) throw new Error('This student profile belongs to another session')
  return { identity, ref, snapshot }
}

const active = (value: unknown) => value !== false && String(value).toLowerCase() !== 'false'
const todayThailand = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

async function mutateOwnedUser(rawUserId: unknown, operation: (user: Data) => { result: unknown; update?: Data }) {
  const userId = String(rawUserId || '')
  const { ref } = await ownedUser(userId)
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    const change = operation(snapshot.data() || {})
    if (change.update) transaction.update(ref, change.update as Record<string, never>)
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
    : item.answer,
  explanation: String(item.explanation || ''),
  pattern: String(item.pattern || item.questionPattern || 'choice'),
  image: String(item.image || item.questionImage || ''),
  matchingPairs: Array.isArray(item.matchingPairs) ? item.matchingPairs : [],
})

async function getRegisteredUsers() {
  await ensureSignedIn()
  const users = (await values('users')).map((item) => ({
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
  return (await values('news')).filter((item) => active(item.isActive)).reverse()
}

export async function getInitialData() {
  const [users, settings, news] = await Promise.all([getRegisteredUsers(), getSettings(), getActiveNews()])
  return { success: true, users: users.data, settings: settings.data, news }
}

export async function loginStudent(rawName: unknown, rawClass: unknown, rawAvatar: unknown) {
  const identity = await ensureSignedIn()
  const name = String(rawName || '').trim()
  const className = String(rawClass || '').trim()
  if (!name || !className) return { success: false, error: 'กรุณาระบุชื่อและชั้นเรียน' }

  const found = await getDocs(query(collection(db, 'users'), where('name', '==', name), where('class', '==', className), limit(1)))
  if (!found.empty) {
    const match = found.docs[0]
    const data = match.data()
    if (data.ownerUid && data.ownerUid !== identity.uid) {
      return { success: false, error: 'โปรไฟล์นี้ถูกผูกกับอุปกรณ์หรือบัญชีอื่นแล้ว' }
    }
    const claimedUser = claimLegacyUserData(data, identity.uid, rawAvatar)
    await updateDoc(match.ref, { ...claimedUser, lastLogin: serverTimestamp() })
    return { success: true, user: normalizeUser(match.id, claimedUser) }
  }

  const ref = doc(collection(db, 'users'))
  const record = {
    name,
    class: className,
    avatar: String(rawAvatar || '🧙‍♂️'),
    xp: 0,
    rank: 'BRONZE',
    level: 1,
    coins: 0,
    streak: 0,
    inventory: { potion: 0, magnifier: 0 },
    ownerUid: identity.uid,
    createdAt: serverTimestamp(),
    lastLogin: serverTimestamp(),
  }
  await setDoc(ref, record)
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
  const [lessonRows, questionRows, progress] = await Promise.all([
    values('lessons'), values('questions'), rawUserId ? getStudentProgress(rawUserId) : Promise.resolve({ data: [] as string[] }),
  ])
  const counts = questionRows.reduce<Record<string, number>>((all, item) => {
    const lessonId = String(item.lessonId || '')
    all[lessonId] = (all[lessonId] || 0) + 1
    return all
  }, {})
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
    questionCount: counts[String(item.lessonId || item.id)] || 0,
  }))
  return { success: true, data: lessons, passedLessons: progress.data }
}

async function questionsFor(rawLessonId: unknown, pretest: boolean) {
  await ensureSignedIn()
  const lessonId = String(rawLessonId || '')
  const rows = await values('questions')
  const selected = rows.filter((item) => {
    const isPretest = String(item.type || 'posttest').toLowerCase() === 'pretest'
    return (lessonId === 'PVP_MODE' || String(item.lessonId) === lessonId) && isPretest === pretest
  })
  return { success: true, data: selected.map(normalizeQuestion).slice(0, lessonId === 'PVP_MODE' ? 10 : undefined) }
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
    const level = Math.floor(xp / 100) + 1
    const rank = rankForXp(xp)

    transaction.set(progressRef, { userId, lessonId, status: String(rawStatus), score, maxScore, updatedAt: serverTimestamp() }, { merge: true })
    transaction.update(userRef, { xp, coins, level, rank })
    return { xp, coins, level, rank, gainedXp, alreadyPassed }
  })
  return { success: true, stats }
}

async function getLeaderboard() {
  await ensureSignedIn()
  const data = (await values('users')).map((item) => normalizeUser(String(item.id), item))
    .sort((a, b) => b.xp - a.xp).slice(0, 20)
  return { success: true, data }
}

async function getGuildLeaderboard() {
  const leaderboard = await getLeaderboard()
  const guilds = Object.values(leaderboard.data.reduce<Record<string, { name: string; totalXp: number; memberCount: number }>>((all, user) => {
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
  return { success: true, data: await values('cyberSafetyScenarios') }
}

async function saveCyberSafetyResult(rawUserId: unknown, rawScore: unknown, rawCoins: unknown, rawXp: unknown) {
  const userId = String(rawUserId || '')
  const { ref } = await ownedUser(userId)
  const result = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    const user = snapshot.data() || {}
    const coins = Number(user.coins || 0) + (Number(rawCoins) || 0)
    const xp = Number(user.xp || 0) + (Number(rawXp) || 0)
    const level = Math.floor(xp / 100) + 1
    const rank = rankForXp(xp)
    transaction.update(ref, { coins, xp, level, rank })
    transaction.set(doc(db, 'progress', `${userId}_CYBER_SAFETY`), {
      userId, lessonId: 'CYBER_SAFETY', status: 'Passed', score: Number(rawScore) || 0, updatedAt: serverTimestamp(),
    }, { merge: true })
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
        lastLogin: todayThailand(),
        inventory: outcome.inventory,
      },
    }
  })
}

async function getDailyQuestStatus(rawUserId: unknown) {
  return mutateOwnedUser(rawUserId, (user) => {
    const current = (user.inventory as Inventory) || {}
    const inventory = resetDailyState(current, todayThailand())
    const changed = current.dailyDate !== inventory.dailyDate
    return {
      result: { success: true, progress: inventory.dailyProgress, done: inventory.dailyDone },
      ...(changed ? { update: { inventory } } : {}),
    }
  })
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
  return mutateOwnedUser(rawUserId, (user) => {
    const outcome = completeQuest(user, todayThailand(), String(rawQuestId || ''), Number(rawCoins) || 0, Number(rawXp) || 0)
    if (!outcome.success) return { result: outcome }
    const level = Math.floor(outcome.xp / 100) + 1
    return {
      result: { success: true, coins: outcome.coins, xp: outcome.xp },
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

async function gachaAvatar(rawUserId: unknown) {
  const selected = pickGachaAvatar()
  return mutateOwnedUser(rawUserId, (user) => {
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
  const [leaderboard, progressResult, lessonsResult] = await Promise.all([getLeaderboard(), getStudentProgress(userId), getLessons()])
  const index = leaderboard.data.findIndex((user) => user.id === userId)
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
  await ensureSignedIn()
  const data = (await values('worldBossConfig')).filter((boss) => active(boss.isActive)).map((boss) => ({
    id: String(boss.bossId || boss.id),
    name: String(boss.bossName || boss.name || ''),
    poseType: String(boss.poseType || ''),
    targetReps: Number(boss.targetReps) || 10,
    maxHp: Number(boss.bossMaxHp || boss.maxHp) || 100,
    rewardCoins: Number(boss.rewardCoins) || 100,
    rewardXp: Number(boss.rewardXp) || 100,
  }))
  return { success: true, data }
}

async function submitWorldBossScore(rawUserId: unknown, rawBossId: unknown, rawScore: unknown, rawBonusCoins: unknown) {
  const userId = String(rawUserId || '')
  const bossId = String(rawBossId || '')
  const { ref: userRef } = await ownedUser(userId)
  const bossRef = doc(db, 'worldBossConfig', bossId)
  const scoreRef = doc(db, 'worldBossScores', `${userId}_${bossId}`)
  return runTransaction(db, async (transaction) => {
    const [userSnapshot, bossSnapshot, scoreSnapshot] = await Promise.all([
      transaction.get(userRef), transaction.get(bossRef), transaction.get(scoreRef),
    ])
    const boss = bossSnapshot.exists()
      ? bossSnapshot.data()
      : bossId === 'WB003'
        ? { bossName: 'วิทยาการคำนวณ ม.2', rewardCoins: 150, rewardXp: 150, isActive: true }
        : null
    if (!boss || !active(boss.isActive)) return { success: false, error: 'ไม่พบบอสที่เปิดใช้งาน' }
    const user = userSnapshot.data() || {}
    const previous = scoreSnapshot.exists() ? Number(scoreSnapshot.data().bestTime ?? scoreSnapshot.data().bestScore) : null
    const score = worldBossResult(bossId, Number(rawScore), previous)
    const rewardCoins = Number(boss.rewardCoins) || 50
    const rewardXp = Number(boss.rewardXp) || 50
    const newCoins = (Number(user.coins) || 0) + rewardCoins + Math.max(0, Number(rawBonusCoins) || 0)
    const newXp = (Number(user.xp) || 0) + rewardXp
    const level = Math.floor(newXp / 100) + 1
    const rank = rankForXp(newXp)
    if (score.isPersonalBest) {
      transaction.set(scoreRef, {
        userId, bossId, name: user.name, className: user.class, bestTime: score.bestScore,
        date: todayThailand(), ownerUid: user.ownerUid, updatedAt: serverTimestamp(),
      }, { merge: true })
    }
    transaction.update(userRef, { coins: newCoins, xp: newXp, level, rank })
    return {
      success: true, isPersonalBest: score.isPersonalBest, previousBest: previous,
      bestTime: score.bestScore, rewardCoins, rewardXp, newCoins, newXp, level, rank,
      bossName: String(boss.bossName || boss.name || 'World Boss'),
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

export const firestoreApi: FirebaseServices = {
  ...aiFallbackApi,
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
  getStudentProgress,
  getLeaderboard,
  getGuildLeaderboard,
  getCyberSafetyScenarios,
  saveCyberSafetyResult,
  claimLoginBonus,
  getDailyQuestStatus,
  updateDailyProgress,
  completeDailyQuest,
  useItem,
  buyItem,
  gachaAvatar,
  getUserStats,
  checkCertificateEligibility,
  getStudentProfileData,
  getWorldBossConfig,
  submitWorldBossScore,
  getWorldBossLeaderboard,
}
