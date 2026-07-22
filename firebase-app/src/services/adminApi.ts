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
import { invalidateAiConfigCache } from './aiApi'
import { maskApiKey } from './geminiLogic'
import { DAILY_QUEST_DEFAULTS, mergeDailyQuestConfig, unlockAllCosmetics } from './gameLogic'
import {
  CLEANUP_TASKS,
  cleanupConfirmPhrase,
  cleanupTask,
  emptyCleanupSnapshot,
  planCleanup,
  type CleanupCollection,
  type CleanupSnapshot,
  type CleanupTaskKey,
} from './adminCleanupLogic'
import { directoryEntry, normalizeUser } from './normalizers'
import {
  aggregateTeacherQuestStats,
  normalizeTeacherQuest,
  questTargetsClass,
  studentQuestStatus,
  validateQuestRewards,
  type StudentQuestSnapshot,
  type TeacherQuestState,
} from './teacherQuestLogic'
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
    lessonMapSet: String(data.lessonMapSet || ''),
    updatedAt: serverTimestamp(),
  }, { merge: true })
  return { success: true, id, message: data.id ? 'Updated successfully' : 'Created successfully' }
}

// Deleting a lesson cascades to everything that only exists to point at it:
// its exam questions and any ครูวีรภัทร์ quest assigned to it. A quest whose
// lesson is gone can never be completed — leaving it would strand students on
// an objective with no lesson behind it.
async function deleteAdminLesson(rawLessonId: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const lessonId = String(rawLessonId || '')
  const [questionRows, questRows] = await Promise.all([
    getDocs(query(collection(adminDb, 'questions'), where('lessonId', '==', lessonId))),
    getDocs(query(collection(adminDb, 'teacherQuests'), where('lessonId', '==', lessonId))),
  ])
  await deleteReferences([...questionRows.docs, ...questRows.docs].map((item) => item.ref))
  await deleteDoc(doc(adminDb, 'lessons', lessonId))
  return { success: true, deletedQuests: questRows.docs.length }
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

// Score rows a student owns outside their own user document. `inventory` bags
// (quest stamps, worksheets, cosmetics) ride along with the user document and
// are handled by resetUserData; these live in their own collections and would
// otherwise survive a reset, leaving a wiped student still on the leaderboards.
async function studentScoreRefs(userId: string): Promise<DocumentReference[]> {
  const [worldBoss, pvpRanking] = await Promise.all([
    getDocs(query(collection(adminDb, 'worldBossScores'), where('userId', '==', userId))),
    getDoc(doc(adminDb, 'pvpRankings', userId)),
  ])
  return [
    ...worldBoss.docs.map((item) => item.ref),
    ...(pvpRanking.exists() ? [pvpRanking.ref] : []),
  ]
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
  await deleteReferences([...progress.docs.map((item) => item.ref), ...await studentScoreRefs(userId)])
  return { success: true }
}

async function deleteStudentData(rawUserId: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const userId = String(rawUserId || '')
  const progress = await getDocs(query(collection(adminDb, 'progress'), where('userId', '==', userId)))
  // Directory first: a leftover directory row whose user document is gone makes
  // the student's name unusable at login, so it must never be what survives a
  // half-finished delete.
  await deleteDoc(doc(adminDb, 'directory', userId))
  await deleteReferences([...progress.docs.map((item) => item.ref), ...await studentScoreRefs(userId)])
  await deleteDoc(doc(adminDb, 'users', userId))
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

// Bulk version of unbindStudentDevice, for a new term or a room of swapped
// tablets. Only `ownerUid` is removed — XP, coins, inventory and progress are
// untouched, so this is a login-binding reset, not a data reset.
async function unbindAllStudentDevices(rawClass: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const classFilter = String(rawClass || '')
  const users = (await getDocs(collection(adminDb, 'users'))).docs
    .filter((item) => !classFilter || String(item.data().class || '') === classFilter)
  // Only documents that are actually bound need a write.
  const bound = users.filter((item) => Boolean(item.data().ownerUid))
  for (let offset = 0; offset < bound.length; offset += 200) {
    const batch = writeBatch(adminDb)
    bound.slice(offset, offset + 200).forEach((item) => batch.update(item.ref, { ownerUid: deleteField() }))
    await batch.commit()
  }
  return { success: true, count: bound.length, message: `ปลดล็อกเครื่องให้นักเรียน ${bound.length} คนแล้ว` }
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
  // Same scope as the single-student reset: progress plus the score rows that
  // live outside the user document. Collections are read once and filtered in
  // memory rather than queried per student.
  const [progress, worldBoss, rankings] = await Promise.all([
    getDocs(collection(adminDb, 'progress')),
    getDocs(collection(adminDb, 'worldBossScores')),
    getDocs(collection(adminDb, 'pvpRankings')),
  ])
  await deleteReferences([
    ...progress.docs.filter((item) => targetIds.has(String(item.data().userId))),
    ...worldBoss.docs.filter((item) => targetIds.has(String(item.data().userId))),
    ...rankings.docs.filter((item) => targetIds.has(item.id)),
  ].map((item) => item.ref))
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

// --- AI (Gemini) configuration ---------------------------------------------
// The key lives in settings/ai (admin-writable, readable only by signed-in
// app users) so it is never bundled into the frontend or settings/public.

async function getAiSettingsAdmin(pin: unknown) {
  await ensureAdminSession(pin)
  const snapshot = await getDoc(doc(adminDb, 'settings', 'ai'))
  const key = String(snapshot.exists() ? snapshot.data().geminiApiKey || '' : '').trim()
  return { success: true, data: { hasKey: key.length > 0, maskedKey: maskApiKey(key) } }
}

async function saveAiSettings(rawKey: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const key = String(rawKey || '').trim()
  if (!key) return { success: false, error: 'กรุณาวาง Gemini API Key ก่อนบันทึก' }
  await setDoc(doc(adminDb, 'settings', 'ai'), {
    geminiApiKey: key,
    updatedAt: serverTimestamp(),
  }, { merge: true })
  invalidateAiConfigCache()
  return { success: true, message: 'บันทึก Gemini API Key แล้ว ระบบ AI พร้อมใช้งาน' }
}

async function clearAiSettings(pin: unknown) {
  await ensureAdminSession(pin)
  await setDoc(doc(adminDb, 'settings', 'ai'), {
    geminiApiKey: deleteField(),
    updatedAt: serverTimestamp(),
  }, { merge: true })
  invalidateAiConfigCache()
  return { success: true, message: 'ลบ Gemini API Key แล้ว ระบบ AI จะกลับสู่โหมดพื้นฐาน' }
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

// The old admin-configurable World Boss feature was retired: the mini-game
// stages are a fixed in-code playset now (src/services/worldBossCatalog.ts).

// --- Teacher quests (ครูวีรภัทร์ NPC assignments) ----------------------------
// Quest definitions live in `teacherQuests`; per-student progress is derived
// from the same real data the student client uses (progress docs + the
// inventory.worksheets / inventory.teacherQuests bags), so the admin view can
// never drift from what the NPC shows.

const todayBangkok = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

const questStateOf = (user: Data, questId: string): TeacherQuestState | undefined => {
  const inventory = user.inventory && typeof user.inventory === 'object' ? user.inventory as Data : {}
  const states = inventory.teacherQuests && typeof inventory.teacherQuests === 'object' ? inventory.teacherQuests as Data : {}
  const state = states[questId]
  return state && typeof state === 'object' ? state as TeacherQuestState : undefined
}

const worksheetOf = (user: Data, lessonId: string): { answer: string; submittedAt: string } | null => {
  const inventory = user.inventory && typeof user.inventory === 'object' ? user.inventory as Data : {}
  const worksheets = inventory.worksheets && typeof inventory.worksheets === 'object' ? inventory.worksheets as Data : {}
  const entry = worksheets[lessonId]
  if (!entry || typeof entry !== 'object') return null
  const record = entry as Data
  return { answer: String(record.answer || ''), submittedAt: String(record.submittedAt || '') }
}

const passedLessonsByUser = (progress: Data[]) => progress.reduce<Record<string, Set<string>>>((all, item) => {
  if (!['Passed', 'Completed'].includes(String(item.status))) return all
  const userId = String(item.userId || '')
  all[userId] ??= new Set()
  all[userId].add(String(item.lessonId || ''))
  return all
}, {})

async function getAdminTeacherQuests(pin: unknown) {
  await ensureAdminSession(pin)
  const [questRows, users, progress] = await Promise.all([rows('teacherQuests'), rows('users'), rows('progress')])
  const today = todayBangkok()
  const passedBy = passedLessonsByUser(progress)
  const data = questRows
    .map((row) => normalizeTeacherQuest(String(row.id), row))
    .sort((a, b) => a.questId.localeCompare(b.questId))
    .map((quest) => {
      const snapshots: StudentQuestSnapshot[] = users.map((user) => ({
        class: String(user.class || ''),
        state: questStateOf(user, quest.questId),
        lessonPassed: passedBy[String(user.id)]?.has(quest.lessonId) || false,
        worksheetSubmitted: worksheetOf(user, quest.lessonId) !== null,
      }))
      return { ...quest, stats: aggregateTeacherQuestStats(quest, snapshots, today) }
    })
  return { success: true, data }
}

async function saveAdminTeacherQuest(rawData: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const data = (rawData || {}) as Data
  const lessonId = String(data.lessonId || '')
  const lesson = await getDoc(doc(adminDb, 'lessons', lessonId))
  if (!lesson.exists()) return { success: false, error: 'ไม่พบบทเรียนที่เลือก กรุณาเลือกบทเรียนอีกครั้ง' }
  let id = String(data.questId || data.id || '').trim()
  if (!id) {
    const quests = await rows('teacherQuests')
    const max = quests.reduce((current, quest) => {
      const match = String(quest.questId || quest.id).match(/^TQ(\d+)$/)
      return match ? Math.max(current, Number(match[1])) : current
    }, 0)
    id = `TQ${String(max + 1).padStart(3, '0')}`
  }
  // normalizeTeacherQuest re-applies the shared shape rules (known objective
  // keys only, valid status, canonical ordering) before anything is stored.
  const quest = normalizeTeacherQuest(id, {
    ...data,
    questId: id,
    lessonTitle: String(lesson.data().title || ''),
  })
  if (!quest.title.trim()) return { success: false, error: 'กรุณาระบุชื่อเควสต์' }
  if (quest.objectives.length === 0) return { success: false, error: 'เลือกสิ่งที่นักเรียนต้องทำอย่างน้อย 1 ข้อ' }
  // Re-checked here, not just in the form: a reward above the Firestore ±1000
  // per-write delta cap would be written fine but rejected at payout time,
  // leaving students unable to hand the quest in at all.
  const rewards = validateQuestRewards(quest.rewards)
  if (!rewards.valid) return { success: false, error: rewards.error }
  await setDoc(doc(adminDb, 'teacherQuests', id), { ...quest, updatedAt: serverTimestamp() }, { merge: true })
  return { success: true, id, message: data.questId ? 'บันทึกเควสต์แล้ว' : 'สร้างเควสต์ใหม่แล้ว' }
}

// Hard delete, distinct from "เก็บถาวร" (archive) which keeps the quest and its
// submission history. The per-student acceptance stamps live inside each user's
// own inventory bag and are left alone: they are inert once the quest document
// is gone (the board only ever shows quests that still exist), and rewriting
// every user document here would be a mass write for no visible gain. The
// cleanup tab's orphan scan is the place to sweep them if that ever matters.
async function deleteAdminTeacherQuest(rawQuestId: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const questId = String(rawQuestId || '').trim()
  if (!questId) return { success: false, error: 'ไม่พบเควสต์ที่จะลบ' }
  await deleteDoc(doc(adminDb, 'teacherQuests', questId))
  return { success: true, message: 'ลบเควสต์แล้ว' }
}

async function getAdminTeacherQuestSubmissions(rawQuestId: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const questId = String(rawQuestId || '')
  const questSnapshot = await getDoc(doc(adminDb, 'teacherQuests', questId))
  if (!questSnapshot.exists()) return { success: false, error: 'ไม่พบเควสต์นี้ในระบบ' }
  const quest = normalizeTeacherQuest(questId, questSnapshot.data())
  const [users, progress] = await Promise.all([rows('users'), rows('progress')])
  const today = todayBangkok()
  const passedBy = passedLessonsByUser(progress)
  const scoreByUser = Object.fromEntries(progress
    .filter((item) => String(item.lessonId) === quest.lessonId)
    .map((item) => [String(item.userId), item]))
  const data = users
    .filter((user) => questTargetsClass(quest, String(user.class || '')))
    .map((user) => {
      const userId = String(user.id)
      const state = questStateOf(user, questId)
      const worksheet = worksheetOf(user, quest.lessonId)
      const scoreRow = scoreByUser[userId]
      return {
        id: userId,
        name: String(user.name || ''),
        class: String(user.class || ''),
        avatar: String(user.avatar || '🧙‍♂️'),
        status: studentQuestStatus(quest, {
          state,
          lessonPassed: passedBy[userId]?.has(quest.lessonId) || false,
          worksheetSubmitted: worksheet !== null,
        }, today),
        worksheetAnswer: worksheet?.answer || '',
        submittedAt: worksheet?.submittedAt || '',
        score: scoreRow ? Number(scoreRow.score) || 0 : null,
        maxScore: scoreRow && scoreRow.maxScore !== undefined ? Number(scoreRow.maxScore) || 0 : null,
        // The one-time study reward is paid on the first worksheet submission,
        // so an existing submission means the reward was already granted.
        rewarded: worksheet !== null,
        acceptedAt: state?.acceptedAt || '',
        turnedInAt: state?.turnedInAt || '',
      }
    })
    .sort((a, b) => a.class.localeCompare(b.class) || a.name.localeCompare(b.name))
  return { success: true, data, quest }
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

// --- System cleanup ---------------------------------------------------------
// Two-phase and deliberately so: scan builds a plan the teacher can read, and
// run re-scans and deletes only what the pure planner returns. Nothing here
// deletes a collection by name — every delete goes through a document id that
// planCleanup produced, which is what keeps authored content safe.

const cleanupSnapshotFor = async (keys: CleanupTaskKey[]): Promise<CleanupSnapshot> => {
  const snapshot = emptyCleanupSnapshot()
  // Only read what the selected tasks actually need; the orphan scan needs the
  // parent collections too, so it can tell a real orphan from a failed read.
  const needed = new Set<CleanupCollection>()
  for (const key of keys) cleanupTask(key).collections.forEach((name) => needed.add(name))
  if (keys.includes('orphans')) {
    ([
      'users', 'directory', 'progress', 'lessons', 'questions', 'teacherQuests',
      'worldBossScores', 'pvpRankings',
    ] as CleanupCollection[]).forEach((name) => needed.add(name))
  }
  await Promise.all([...needed].map(async (name) => {
    snapshot[name] = (await rows(name)) as CleanupSnapshot[CleanupCollection]
  }))
  return snapshot
}

const normalizeCleanupKeys = (raw: unknown): CleanupTaskKey[] => {
  const keys = Array.isArray(raw) ? raw.map(String) : []
  return CLEANUP_TASKS.map((task) => task.key).filter((key) => keys.includes(key))
}

async function scanSystemCleanup(rawKeys: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const keys = normalizeCleanupKeys(rawKeys)
  const plan = planCleanup(keys, await cleanupSnapshotFor(keys))
  return { success: true, data: { summary: plan.summary, total: plan.total, confirmPhrase: cleanupConfirmPhrase(keys) } }
}

async function runSystemCleanup(rawKeys: unknown, rawConfirmation: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const keys = normalizeCleanupKeys(rawKeys)
  if (keys.length === 0) return { success: false, error: 'ยังไม่ได้เลือกรายการที่จะล้าง' }
  // The typed phrase is re-checked here, not only in the UI, so a mis-wired
  // button can never reach the delete loop.
  if (String(rawConfirmation || '').trim() !== cleanupConfirmPhrase(keys)) {
    return { success: false, error: 'คำยืนยันไม่ถูกต้อง กรุณาพิมพ์ข้อความยืนยันให้ตรง' }
  }
  // Re-scanned rather than trusting the ids from the preview: the plan the
  // teacher approved may be minutes old, and deleting a stale id set could
  // remove a student who registered in the meantime.
  const plan = planCleanup(keys, await cleanupSnapshotFor(keys))
  await deleteReferences(plan.targets.map((target) => doc(adminDb, target.collection, target.id)))
  return { success: true, count: plan.total, message: `ล้างข้อมูลแล้ว ${plan.total} รายการ` }
}

async function exportSystemBackup(pin: unknown) {
  await ensureAdminSession(pin)
  // Everything the cleanup tab can touch, so a mistaken wipe is recoverable.
  const names: CleanupCollection[] = [
    'users', 'directory', 'progress', 'lessons', 'questions', 'teacherQuests',
    'clientErrors', 'pvpMatches', 'pvpRooms', 'pvpRankings', 'worldBossScores',
  ]
  const data: Record<string, Data[]> = {}
  await Promise.all(names.map(async (name) => { data[name] = await rows(name) }))
  return { success: true, data: { exportedAt: new Date().toISOString(), collections: data } }
}

// --- Equipment grants -------------------------------------------------------

async function unlockAllStudentEquipment(rawUserId: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const userId = String(rawUserId || '')
  const userRef = doc(adminDb, 'users', userId)
  const user = await getDoc(userRef)
  if (!user.exists()) return { success: false, error: 'ไม่พบผู้เล่น' }
  const inventory = unlockAllCosmetics((user.data().inventory || {}) as Data)
  await updateDoc(userRef, { inventory })
  return { success: true, message: 'ปลดล็อกอุปกรณ์ทั้งหมดให้ผู้เล่นแล้ว' }
}

async function unlockAllEquipmentForClass(rawClass: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const classFilter = String(rawClass || '')
  const users = (await getDocs(collection(adminDb, 'users'))).docs
    .filter((item) => !classFilter || String(item.data().class || '') === classFilter)
  for (let offset = 0; offset < users.length; offset += 200) {
    const batch = writeBatch(adminDb)
    users.slice(offset, offset + 200).forEach((item) => {
      batch.update(item.ref, { inventory: unlockAllCosmetics((item.data().inventory || {}) as Data) })
    })
    await batch.commit()
  }
  return { success: true, count: users.length, message: `ปลดล็อกอุปกรณ์ให้นักเรียน ${users.length} คนแล้ว` }
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
  unbindAllStudentDevices,
  resetAllStudentData,
  unlockAllStudentEquipment,
  unlockAllEquipmentForClass,
  scanSystemCleanup,
  runSystemCleanup,
  exportSystemBackup,
  saveSettings,
  getAiSettingsAdmin,
  saveAiSettings,
  clearAiSettings,
  getAllNewsAdmin,
  saveNewsItem,
  deleteNewsItem,
  getExamReports,
  getAdminDailyQuests,
  saveAdminDailyQuest,
  getAdminTeacherQuests,
  saveAdminTeacherQuest,
  deleteAdminTeacherQuest,
  getAdminTeacherQuestSubmissions,
  getAdminCyberScenarios,
  saveAdminCyberScenario,
  deleteAdminCyberScenario,
} satisfies FirebaseServices
