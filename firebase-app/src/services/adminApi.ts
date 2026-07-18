import {
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore'
import { adminDb, ensureAdminSession } from '../firebase/adminClient'
import { adminQuestion, resetUserData, sanitizePublicSettings, studentReport } from './adminLogic'
import { DAILY_QUEST_DEFAULTS, mergeDailyQuestConfig } from './gameLogic'
import { directoryEntry, normalizeUser } from './normalizers'
import type { FirebaseServices } from './legacyRunner'

type Data = Record<string, unknown>

const rows = async (name: string) => {
  const snapshot = await getDocs(collection(adminDb, name))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Data))
}

async function deleteReferences(refs: DocumentReference[]) {
  for (let offset = 0; offset < refs.length; offset += 400) {
    const batch = writeBatch(adminDb)
    refs.slice(offset, offset + 400).forEach((ref) => batch.delete(ref))
    await batch.commit()
  }
}

async function verifyAdminPin(pin: unknown) {
  try {
    await ensureAdminSession(pin)
    return { success: true, isValid: true }
  } catch (reason) {
    // A network failure is not a wrong password: report it as such so the
    // teacher does not retype a correct password into a dead connection.
    const code = (reason as { code?: string })?.code || ''
    if (code === 'auth/network-request-failed') {
      return { success: false, isValid: false, error: 'เชื่อมต่อเครือข่ายไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }
    }
    if (code === 'auth/too-many-requests') {
      return { success: false, isValid: false, error: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' }
    }
    return { success: true, isValid: false }
  }
}

async function saveAdminLesson(rawData: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const data = (rawData || {}) as Data
  let id = String(data.id || '')
  if (!id) {
    const lessons = await rows('lessons')
    const max = lessons.reduce((current, lesson) => {
      const match = String(lesson.lessonId || lesson.id).match(/^L(\d+)$/)
      return match ? Math.max(current, Number(match[1])) : current
    }, 0)
    id = `L${max + 1}`
  }
  await setDoc(doc(adminDb, 'lessons', id), {
    lessonId: id,
    title: String(data.title || ''),
    description: String(data.description || ''),
    videoUrl: String(data.videoUrl || ''),
    icon: String(data.icon || '🗺️'),
    isActive: data.isActive !== false,
    enablePretest: data.enablePretest === true,
    worksheetUrl: String(data.worksheetUrl || ''),
    content: String(data.content || ''),
    mapStyle: String(data.mapStyle || ''),
    updatedAt: serverTimestamp(),
  }, { merge: true })
  return { success: true, id, message: data.id ? 'Updated successfully' : 'Created successfully' }
}

async function deleteAdminLesson(rawLessonId: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const lessonId = String(rawLessonId || '')
  const questionRows = await getDocs(query(collection(adminDb, 'questions'), where('lessonId', '==', lessonId)))
  await deleteReferences(questionRows.docs.map((item) => item.ref))
  await deleteDoc(doc(adminDb, 'lessons', lessonId))
  return { success: true }
}

async function getAdminQuestionsByLessonAndType(rawLessonId: unknown, rawType: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const lessonId = String(rawLessonId || '')
  const type = String(rawType || 'posttest').toLowerCase()
  const snapshot = await getDocs(query(collection(adminDb, 'questions'), where('lessonId', '==', lessonId)))
  const data = snapshot.docs
    .filter((item) => String(item.data().type || 'posttest').toLowerCase() === type)
    .map((item) => adminQuestion(item.id, item.data()))
  return { success: true, data }
}

async function saveBatchQuestions(rawLessonId: unknown, rawType: unknown, rawQuestions: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const lessonId = String(rawLessonId || '')
  const type = String(rawType || 'posttest').toLowerCase()
  const existing = await getDocs(query(collection(adminDb, 'questions'), where('lessonId', '==', lessonId)))
  const matching = existing.docs.filter((item) => String(item.data().type || 'posttest').toLowerCase() === type)
  await deleteReferences(matching.map((item) => item.ref))

  const questions = Array.isArray(rawQuestions) ? rawQuestions as Data[] : []
  for (let offset = 0; offset < questions.length; offset += 400) {
    const batch = writeBatch(adminDb)
    questions.slice(offset, offset + 400).forEach((question) => {
      const ref = doc(collection(adminDb, 'questions'))
      const options = Array.isArray(question.options) ? question.options : []
      batch.set(ref, {
        questionId: ref.id,
        lessonId,
        questionText: String(question.text || ''),
        options: options.map(String),
        answer: question.answer ?? 1,
        explanation: String(question.explanation || ''),
        type,
        pattern: String(question.pattern || 'choice'),
        image: String(question.image || ''),
        matchingPairs: Array.isArray(question.matchingPairs) ? question.matchingPairs : [],
        updatedAt: serverTimestamp(),
      })
    })
    await batch.commit()
  }
  return { success: true, message: 'บันทึกข้อสอบเสร็จสมบูรณ์' }
}

async function getAdminStudents(pin: unknown) {
  await ensureAdminSession(pin)
  const [users, progress, lessons] = await Promise.all([rows('users'), rows('progress'), rows('lessons')])
  const passedByUser = progress.reduce<Record<string, Set<string>>>((all, item) => {
    if (String(item.status) !== 'Passed') return all
    const userId = String(item.userId || '')
    all[userId] ??= new Set()
    all[userId].add(String(item.lessonId || ''))
    return all
  }, {})
  const lessonList = lessons.filter((item) => item.isActive !== false).map((item) => ({
    id: String(item.lessonId || item.id), title: String(item.title || ''),
  }))
  const data = users.map((item) => {
    const user = normalizeUser(String(item.id), item)
    const passed = passedByUser[user.id] || new Set<string>()
    const current = lessonList.find((lesson) => !passed.has(lesson.id))
    return { ...user, currentLesson: current?.title || (lessonList.length ? 'เคลียร์ทุกด่านแล้ว!' : 'ยังไม่มีด่าน') }
  })
  return { success: true, data }
}

async function resetStudentData(rawUserId: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const userId = String(rawUserId || '')
  const userRef = doc(adminDb, 'users', userId)
  const user = await getDoc(userRef)
  if (!user.exists()) return { success: false, error: 'ไม่พบผู้เล่น' }
  const reset = resetUserData(user.data())
  await setDoc(userRef, reset, { merge: true })
  await setDoc(doc(adminDb, 'directory', userId), directoryEntry(reset), { merge: true })
  const progress = await getDocs(query(collection(adminDb, 'progress'), where('userId', '==', userId)))
  await deleteReferences(progress.docs.map((item) => item.ref))
  return { success: true }
}

async function deleteStudentData(rawUserId: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const userId = String(rawUserId || '')
  const progress = await getDocs(query(collection(adminDb, 'progress'), where('userId', '==', userId)))
  await deleteReferences(progress.docs.map((item) => item.ref))
  await deleteDoc(doc(adminDb, 'users', userId))
  await deleteDoc(doc(adminDb, 'directory', userId))
  return { success: true }
}

async function unbindStudentDevice(rawUserId: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const userId = String(rawUserId || '')
  const userRef = doc(adminDb, 'users', userId)
  const user = await getDoc(userRef)
  if (!user.exists()) return { success: false, error: 'ไม่พบผู้เล่น' }
  // Removing ownerUid re-opens the one-shot claim so the student can log in
  // again from a new device or a wiped browser profile.
  await updateDoc(userRef, { ownerUid: deleteField() })
  return { success: true, message: 'ปลดล็อกโปรไฟล์แล้ว นักเรียนสามารถล็อกอินจากอุปกรณ์ใหม่ได้ทันที' }
}

async function resetAllStudentData(rawClass: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const classFilter = String(rawClass || '')
  const users = (await getDocs(collection(adminDb, 'users'))).docs.filter((item) => !classFilter || item.data().class === classFilter)
  const targetIds = new Set(users.map((item) => item.id))
  for (let offset = 0; offset < users.length; offset += 200) {
    const batch = writeBatch(adminDb)
    users.slice(offset, offset + 200).forEach((item) => {
      const reset = resetUserData(item.data())
      batch.set(item.ref, reset, { merge: true })
      batch.set(doc(adminDb, 'directory', item.id), directoryEntry(reset), { merge: true })
    })
    await batch.commit()
  }
  const progress = await getDocs(collection(adminDb, 'progress'))
  await deleteReferences(progress.docs.filter((item) => targetIds.has(String(item.data().userId))).map((item) => item.ref))
  return { success: true, count: users.length }
}

async function saveSettings(rawSettings: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const settings = sanitizePublicSettings((rawSettings || {}) as Data)
  await setDoc(doc(adminDb, 'settings', 'public'), {
    ...settings,
    AdminPIN: deleteField(),
    GeminiAPIKey: deleteField(),
  }, { merge: true })
  return { success: true, message: 'Settings saved' }
}

async function getAllNewsAdmin(pin: unknown) {
  await ensureAdminSession(pin)
  const data = (await rows('news')).reverse().map((item) => ({
    id: String(item.id || ''),
    title: String(item.title || ''),
    content: String(item.content || ''),
    icon: String(item.icon || '📌'),
    type: String(item.type || 'NEWS'),
    date: String(item.date || ''),
    isActive: item.isActive !== false,
  }))
  return { success: true, data }
}

async function saveNewsItem(rawItem: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const item = (rawItem || {}) as Data
  const ref = item.id ? doc(adminDb, 'news', String(item.id)) : doc(collection(adminDb, 'news'))
  await setDoc(ref, {
    newsId: ref.id,
    icon: String(item.icon || '📌'),
    type: String(item.type || 'NEWS'),
    title: String(item.title || ''),
    content: String(item.content || ''),
    date: String(item.date || new Date().toLocaleDateString('th-TH')),
    isActive: item.isActive !== false,
    updatedAt: serverTimestamp(),
  }, { merge: true })
  return { success: true, message: item.id ? 'บันทึกอัปเดตประกาศสำเร็จ' : 'เพิ่มประกาศใหม่สำเร็จ' }
}

async function deleteNewsItem(rawId: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  await deleteDoc(doc(adminDb, 'news', String(rawId || '')))
  return { success: true, message: 'ลบประกาศเรียบร้อยแล้ว' }
}

// --- Daily-quest configuration (three fixed counter types; see gameLogic) ---

async function getAdminDailyQuests(pin: unknown) {
  await ensureAdminSession(pin)
  const questRows = await rows('dailyQuests')
  const byId = new Map(questRows.map((row) => [String(row.questId || row.id), row]))
  // Admin sees all three (including inactive) so a hidden quest can be re-enabled.
  const data = DAILY_QUEST_DEFAULTS.map((defaults) => mergeDailyQuestConfig(defaults, byId.get(defaults.id)))
  return { success: true, data }
}

async function saveAdminDailyQuest(rawData: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const data = (rawData || {}) as Data
  const questId = String(data.id || '')
  const defaults = DAILY_QUEST_DEFAULTS.find((quest) => quest.id === questId)
  if (!defaults) return { success: false, error: 'ไม่รู้จักประเภทภารกิจนี้ (รองรับ login / play1 / correct5)' }
  const merged = mergeDailyQuestConfig(defaults, { ...data, isActive: data.isActive !== false })
  await setDoc(doc(adminDb, 'dailyQuests', questId), {
    questId,
    title: merged.title,
    description: merged.description,
    target: merged.target,
    coins: merged.coins,
    xp: merged.xp,
    isActive: merged.isActive,
    updatedAt: serverTimestamp(),
  }, { merge: true })
  return { success: true, message: 'บันทึกภารกิจรายวันแล้ว' }
}

// --- World Boss configuration --------------------------------------------

async function getAdminWorldBosses(pin: unknown) {
  await ensureAdminSession(pin)
  const bosses = (await rows('worldBossConfig')).map((boss) => ({
    id: String(boss.bossId || boss.id),
    name: String(boss.bossName || boss.name || ''),
    poseType: String(boss.poseType || ''),
    targetReps: Number(boss.targetReps) || 10,
    maxHp: Number(boss.bossMaxHp || boss.maxHp) || 100,
    rewardCoins: Number(boss.rewardCoins) || 100,
    rewardXp: Number(boss.rewardXp) || 100,
    isActive: boss.isActive !== false,
  })).sort((a, b) => a.id.localeCompare(b.id))
  return { success: true, data: bosses }
}

async function saveAdminWorldBoss(rawData: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const data = (rawData || {}) as Data
  let id = String(data.id || '').trim().toUpperCase()
  if (!id) {
    const bosses = await rows('worldBossConfig')
    const max = bosses.reduce((current, boss) => {
      const match = String(boss.bossId || boss.id).match(/^WB(\d+)$/)
      return match ? Math.max(current, Number(match[1])) : current
    }, 0)
    id = `WB${String(max + 1).padStart(3, '0')}`
  }
  // Rewards stay under the Firestore ±1000 delta rule for user documents.
  const clamp = (value: unknown, fallback: number, cap: number) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? Math.min(cap, Math.round(parsed)) : fallback
  }
  await setDoc(doc(adminDb, 'worldBossConfig', id), {
    bossId: id,
    bossName: String(data.name || ''),
    poseType: String(data.poseType || ''),
    targetReps: clamp(data.targetReps, 10, 500),
    bossMaxHp: clamp(data.maxHp, 100, 100000),
    rewardCoins: clamp(data.rewardCoins, 100, 900),
    rewardXp: clamp(data.rewardXp, 100, 900),
    isActive: data.isActive !== false,
    updatedAt: serverTimestamp(),
  }, { merge: true })
  return { success: true, id, message: 'บันทึกเวิลด์บอสแล้ว' }
}

async function deleteAdminWorldBoss(rawId: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  await deleteDoc(doc(adminDb, 'worldBossConfig', String(rawId || '')))
  return { success: true, message: 'ลบเวิลด์บอสแล้ว' }
}

// --- Cyber Safety scenarios ------------------------------------------------

async function getAdminCyberScenarios(pin: unknown) {
  await ensureAdminSession(pin)
  const scenarios = (await rows('cyberSafetyScenarios')).map((scenario) => ({
    id: String(scenario.scenarioId || scenario.id),
    timeOfDay: String(scenario.timeOfDay || ''),
    title: String(scenario.title || ''),
    text: String(scenario.text || scenario.scenarioText || ''),
    opt1: String(scenario.opt1 || ''),
    opt2: String(scenario.opt2 || ''),
    answerIdx: Math.max(0, Math.min(1, Number(scenario.answerIdx) || 0)),
    feedbackWrong: String(scenario.feedbackWrong || ''),
    feedbackRight: String(scenario.feedbackRight || ''),
  })).sort((a, b) => a.id.localeCompare(b.id))
  return { success: true, data: scenarios }
}

async function saveAdminCyberScenario(rawData: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const data = (rawData || {}) as Data
  let id = String(data.id || '').trim()
  if (!id) {
    const scenarios = await rows('cyberSafetyScenarios')
    const max = scenarios.reduce((current, scenario) => {
      const match = String(scenario.scenarioId || scenario.id).match(/(\d+)$/)
      return match ? Math.max(current, Number(match[1])) : current
    }, 0)
    id = `CS${String(max + 1).padStart(3, '0')}`
  }
  await setDoc(doc(adminDb, 'cyberSafetyScenarios', id), {
    scenarioId: id,
    timeOfDay: String(data.timeOfDay || ''),
    title: String(data.title || ''),
    text: String(data.text || ''),
    opt1: String(data.opt1 || ''),
    opt2: String(data.opt2 || ''),
    answerIdx: Math.max(0, Math.min(1, Number(data.answerIdx) || 0)),
    feedbackWrong: String(data.feedbackWrong || ''),
    feedbackRight: String(data.feedbackRight || ''),
    updatedAt: serverTimestamp(),
  }, { merge: true })
  return { success: true, id, message: 'บันทึกสถานการณ์ไซเบอร์แล้ว' }
}

async function deleteAdminCyberScenario(rawId: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  await deleteDoc(doc(adminDb, 'cyberSafetyScenarios', String(rawId || '')))
  return { success: true, message: 'ลบสถานการณ์แล้ว' }
}

async function getExamReports(rawLessonId: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const lessonId = String(rawLessonId || '')
  const [users, questions, progress] = await Promise.all([rows('users'), rows('questions'), rows('progress')])
  const userMap = Object.fromEntries(users.map((user) => [String(user.id), user]))
  const totalQuestions = questions.filter((question) => String(question.lessonId) === lessonId && String(question.type || 'posttest').toLowerCase() !== 'pretest').length
  const data = progress.filter((item) => String(item.lessonId) === lessonId)
    .map((item) => studentReport(userMap[String(item.userId)] || { name: item.userId, class: '-' }, item, totalQuestions))
    .sort((a, b) => b.score - a.score)
  return { success: true, data }
}

export const adminApi = {
  verifyAdminPin,
  saveAdminLesson,
  deleteAdminLesson,
  getAdminQuestionsByLessonAndType,
  saveBatchQuestions,
  getAdminStudents,
  resetStudentData,
  deleteStudentData,
  unbindStudentDevice,
  resetAllStudentData,
  saveSettings,
  getAllNewsAdmin,
  saveNewsItem,
  deleteNewsItem,
  getExamReports,
  getAdminDailyQuests,
  saveAdminDailyQuest,
  getAdminWorldBosses,
  saveAdminWorldBoss,
  deleteAdminWorldBoss,
  getAdminCyberScenarios,
  saveAdminCyberScenario,
  deleteAdminCyberScenario,
} satisfies FirebaseServices
