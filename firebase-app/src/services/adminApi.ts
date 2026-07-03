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
  where,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore'
import { adminDb, ensureAdminSession } from '../firebase/adminClient'
import { adminQuestion, resetUserData, sanitizePublicSettings, studentReport } from './adminLogic'
import { normalizeUser } from './normalizers'
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
  } catch {
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
  await setDoc(userRef, resetUserData(user.data()), { merge: true })
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
  return { success: true }
}

async function resetAllStudentData(rawClass: unknown, pin: unknown) {
  await ensureAdminSession(pin)
  const classFilter = String(rawClass || '')
  const users = (await getDocs(collection(adminDb, 'users'))).docs.filter((item) => !classFilter || item.data().class === classFilter)
  const targetIds = new Set(users.map((item) => item.id))
  for (let offset = 0; offset < users.length; offset += 400) {
    const batch = writeBatch(adminDb)
    users.slice(offset, offset + 400).forEach((item) => batch.set(item.ref, resetUserData(item.data()), { merge: true }))
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
  const data = (await rows('news')).reverse()
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

export const adminApi: FirebaseServices = {
  verifyAdminPin,
  saveAdminLesson,
  deleteAdminLesson,
  getAdminQuestionsByLessonAndType,
  saveBatchQuestions,
  getAdminStudents,
  resetStudentData,
  deleteStudentData,
  resetAllStudentData,
  saveSettings,
  getAllNewsAdmin,
  saveNewsItem,
  deleteNewsItem,
  getExamReports,
}
