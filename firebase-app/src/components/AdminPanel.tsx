import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { reportSummary, reportsToCsv, type ExamReport } from './adminPanelLogic'
import { MAP_ENTRANCE_TEMPLATES, entranceTemplateForLesson } from './mapEntranceTemplates'
import { MarkdownLite } from './MarkdownLite'
import type { GeneratedLessonBundle } from '../services/geminiLogic'

type Result<T = unknown> = { success: boolean; data?: T; error?: string; isValid?: boolean; answer?: string; count?: number; id?: string; mode?: string; message?: string }

export type AiLessonSpec = {
  topic: string
  gradeLevel: string
  posttestCount: number
  pretestCount: number
  notes: string
  questionsOnly?: '' | 'pretest' | 'posttest'
  mapStyles: Array<{ id: string; name: string }>
}

export type AiSettingsInfo = { hasKey: boolean; maskedKey: string }

export type AdminLesson = {
  id: string
  title: string
  description?: string
  videoUrl?: string
  icon?: string
  isActive?: boolean
  enablePretest?: boolean
  worksheetUrl?: string
  content?: string
  mapStyle?: string
  questionCount?: number
}

export type AdminQuestion = {
  id?: string
  text: string
  options: string[]
  answer: number | string
  explanation: string
  pattern: 'choice' | 'matching'
  image: string
  matchingPairs: Array<{ left: string; right: string }>
}

export type AdminStudent = {
  id: string
  name: string
  class: string
  avatar?: string
  xp?: number
  rank?: string
  level?: number
  currentLesson?: string
  [key: string]: unknown
}

export type AdminNews = {
  id?: string
  title: string
  content: string
  icon?: string
  type?: string
  date?: string
  isActive?: boolean
}

export type AdminDailyQuest = {
  id: 'login' | 'play1' | 'correct5'
  title: string
  description: string
  target: number
  coins: number
  xp: number
  isActive: boolean
}

export type AdminCyberScenario = {
  id?: string
  timeOfDay?: string
  title: string
  text: string
  opt1: string
  opt2: string
  answerIdx: number
  feedbackWrong?: string
  feedbackRight?: string
}

export interface AdminService {
  verify(password: string): Promise<Result>
  logout(): Promise<void>
  loadLessons(): Promise<Result<AdminLesson[]>>
  saveLesson(lesson: AdminLesson, password: string): Promise<Result>
  deleteLesson(id: string, password: string): Promise<Result>
  loadQuestions(lessonId: string, type: string, password: string): Promise<Result<AdminQuestion[]>>
  saveQuestions(lessonId: string, type: string, questions: AdminQuestion[], password: string): Promise<Result>
  loadStudents(password: string): Promise<Result<AdminStudent[]>>
  resetStudent(id: string, password: string): Promise<Result>
  deleteStudent(id: string, password: string): Promise<Result>
  unbindStudent(id: string, password: string): Promise<Result>
  resetAllStudents(className: string, password: string): Promise<Result>
  loadSettings(): Promise<Result<Record<string, unknown>>>
  saveSettings(settings: Record<string, unknown>, password: string): Promise<Result>
  loadNews(password: string): Promise<Result<AdminNews[]>>
  saveNews(news: AdminNews, password: string): Promise<Result>
  deleteNews(id: string, password: string): Promise<Result>
  loadReports(lessonId: string, password: string): Promise<Result<ExamReport[]>>
  generateProgressReport(student: AdminStudent): Promise<Result>
  loadDailyQuests(password: string): Promise<Result<AdminDailyQuest[]>>
  saveDailyQuest(quest: AdminDailyQuest, password: string): Promise<Result>
  loadCyberScenarios(password: string): Promise<Result<AdminCyberScenario[]>>
  saveCyberScenario(scenario: AdminCyberScenario, password: string): Promise<Result>
  deleteCyberScenario(id: string, password: string): Promise<Result>
  generateLesson(spec: AiLessonSpec, password: string): Promise<Result<GeneratedLessonBundle>>
  loadAiSettings(password: string): Promise<Result<AiSettingsInfo>>
  saveAiKey(key: string, password: string): Promise<Result>
  clearAiKey(password: string): Promise<Result>
  testAiKey(key: string): Promise<Result>
}

type AiDraft = {
  step: 'form' | 'preview'
  topic: string
  gradeLevel: string
  posttestCount: number
  pretestCount: number
  includePretest: boolean
  notes: string
  bundle: GeneratedLessonBundle | null
  working: boolean
  error: string
}

const emptyAiDraft = (): AiDraft => ({
  step: 'form', topic: '', gradeLevel: 'ป.5', posttestCount: 10, pretestCount: 5,
  includePretest: true, notes: '', bundle: null, working: false, error: '',
})

type Tab = 'lessons' | 'daily' | 'cyber' | 'students' | 'reports' | 'settings' | 'news'

const emptyLesson = (): AdminLesson => ({ id: '', title: '', description: '', videoUrl: '', icon: '🗺️', isActive: true, enablePretest: false, worksheetUrl: '', content: '', mapStyle: '' })
const emptyQuestion = (): AdminQuestion => ({ text: '', options: ['', '', '', ''], answer: 1, explanation: '', pattern: 'choice', image: '', matchingPairs: [{ left: '', right: '' }] })
const emptyNews = (): AdminNews => ({ title: '', content: '', icon: '📢', type: 'NEWS', date: new Date().toLocaleDateString('th-TH'), isActive: true })
const emptyCyberScenario = (): AdminCyberScenario => ({ id: '', timeOfDay: '', title: '', text: '', opt1: '', opt2: '', answerIdx: 0, feedbackWrong: '', feedbackRight: '' })

function Modal({ label, children, onClose }: { label: string; children: ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-label={label}>
    <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
      <div className="mb-5 flex items-center justify-between"><h2 className="text-2xl font-black text-indigo-700">{label}</h2><button type="button" onClick={onClose} aria-label={`ปิด ${label}`} className="text-3xl">×</button></div>
      {children}
    </div>
  </div>
}

const fieldClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 outline-none focus:border-indigo-500'
const primary = 'rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 font-bold text-white shadow hover:brightness-110 disabled:opacity-50'
const secondary = 'rounded-xl bg-slate-200 px-3 py-2 font-bold text-slate-700 hover:bg-slate-300'

export function AdminPanel({ service, onExit, confirmAction = (message) => window.confirm(message), downloadCsv = defaultDownload }: {
  service: AdminService
  onExit: () => void
  confirmAction?: (message: string) => boolean
  downloadCsv?: (csv: string) => void
}) {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [tab, setTab] = useState<Tab>('lessons')
  const [lessons, setLessons] = useState<AdminLesson[]>([])
  const [students, setStudents] = useState<AdminStudent[]>([])
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [news, setNews] = useState<AdminNews[]>([])
  const [reports, setReports] = useState<ExamReport[]>([])
  const [reportLesson, setReportLesson] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [lessonDraft, setLessonDraft] = useState<AdminLesson | null>(null)
  const [questionLesson, setQuestionLesson] = useState<AdminLesson | null>(null)
  const [questionType, setQuestionType] = useState('posttest')
  const [questions, setQuestions] = useState<AdminQuestion[]>([])
  const [newsDraft, setNewsDraft] = useState<AdminNews | null>(null)
  const [analysis, setAnalysis] = useState<{ name: string; text: string; mode?: string; loading: boolean } | null>(null)
  const [aiDraft, setAiDraft] = useState<AiDraft | null>(null)
  const [aiSettings, setAiSettings] = useState<AiSettingsInfo | null>(null)
  const [aiKeyInput, setAiKeyInput] = useState('')
  const [questionAiTopic, setQuestionAiTopic] = useState('')
  const [questionAiCount, setQuestionAiCount] = useState(5)
  const [questionAiBusy, setQuestionAiBusy] = useState(false)
  const [dailyQuests, setDailyQuests] = useState<AdminDailyQuest[]>([])
  const [dailyDraft, setDailyDraft] = useState<AdminDailyQuest | null>(null)
  const [cyberScenarios, setCyberScenarios] = useState<AdminCyberScenario[]>([])
  const [scenarioDraft, setScenarioDraft] = useState<AdminCyberScenario | null>(null)

  const run = useCallback(async (task: () => Promise<Result>, success = '') => {
    setBusy(true); setStatus('')
    try {
      const result = await task()
      if (!result.success) throw new Error(result.error || 'ดำเนินการไม่สำเร็จ')
      if (success) setStatus(success)
      return result
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด')
      return null
    } finally { setBusy(false) }
  }, [])

  const loadLessons = useCallback(async () => {
    const result = await run(() => service.loadLessons())
    if (result?.data) setLessons(result.data as AdminLesson[])
  }, [run, service])

  useEffect(() => {
    const open = () => { setLoginError(''); setStatus(''); if (authenticated) void loadLessons() }
    window.addEventListener('nextgen:open-admin', open)
    return () => window.removeEventListener('nextgen:open-admin', open)
  }, [authenticated, loadLessons])

  const login = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setLoginError('')
    try {
      const result = await service.verify(password)
      if (!result.success || !result.isValid) { setLoginError(result.error || 'รหัสผ่านไม่ถูกต้อง'); return }
      setAuthenticated(true); setTab('lessons'); await loadLessons()
    } catch { setLoginError('เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ') }
    finally { setBusy(false) }
  }

  const changeTab = async (next: Tab) => {
    setTab(next); setStatus('')
    if (next === 'lessons' || next === 'reports') await loadLessons()
    if (next === 'students') { const result = await run(() => service.loadStudents(password)); if (result?.data) setStudents(result.data as AdminStudent[]) }
    if (next === 'settings') {
      const result = await run(() => service.loadSettings())
      if (result?.data) setSettings(result.data as Record<string, unknown>)
      const ai = await service.loadAiSettings(password).catch(() => null)
      setAiSettings(ai?.success && ai.data ? ai.data : { hasKey: false, maskedKey: '' })
    }
    if (next === 'news') { const result = await run(() => service.loadNews(password)); if (result?.data) setNews(result.data as AdminNews[]) }
    if (next === 'daily') { const result = await run(() => service.loadDailyQuests(password)); if (result?.data) setDailyQuests(result.data as AdminDailyQuest[]) }
    if (next === 'cyber') { const result = await run(() => service.loadCyberScenarios(password)); if (result?.data) setCyberScenarios(result.data as AdminCyberScenario[]) }
  }

  const saveDailyQuest = async (event: FormEvent) => {
    event.preventDefault(); if (!dailyDraft) return
    const result = await run(() => service.saveDailyQuest(dailyDraft, password), 'บันทึกภารกิจรายวันแล้ว')
    if (result) { setDailyDraft(null); const refreshed = await service.loadDailyQuests(password); if (refreshed.data) setDailyQuests(refreshed.data) }
  }
  const saveCyberScenario = async (event: FormEvent) => {
    event.preventDefault(); if (!scenarioDraft?.text.trim() || !scenarioDraft.opt1.trim() || !scenarioDraft.opt2.trim()) return setStatus('กรุณาระบุสถานการณ์และตัวเลือกให้ครบ')
    const result = await run(() => service.saveCyberScenario(scenarioDraft, password), 'บันทึกสถานการณ์แล้ว')
    if (result) { setScenarioDraft(null); const refreshed = await service.loadCyberScenarios(password); if (refreshed.data) setCyberScenarios(refreshed.data) }
  }
  const deleteCyberScenario = async (scenario: AdminCyberScenario) => {
    if (!scenario.id || !confirmAction(`ลบสถานการณ์ ${scenario.title || scenario.id}?`)) return
    const result = await run(() => service.deleteCyberScenario(scenario.id!, password), 'ลบสถานการณ์แล้ว')
    if (result) setCyberScenarios((all) => all.filter((item) => item.id !== scenario.id))
  }

  const logout = async () => { await service.logout(); setAuthenticated(false); setPassword(''); onExit() }
  const saveLesson = async (event: FormEvent) => {
    event.preventDefault(); if (!lessonDraft?.title.trim()) return setStatus('กรุณาระบุชื่อบทเรียน')
    const result = await run(() => service.saveLesson(lessonDraft, password), 'บันทึกบทเรียนแล้ว')
    if (result) { setLessonDraft(null); await loadLessons() }
  }
  const deleteLesson = async (lesson: AdminLesson) => {
    if (!confirmAction(`ลบบทเรียน ${lesson.title} และข้อสอบทั้งหมด?`)) return
    const result = await run(() => service.deleteLesson(lesson.id, password), 'ลบบทเรียนแล้ว')
    if (result) await loadLessons()
  }
  const openQuestions = async (lesson: AdminLesson) => {
    setQuestionLesson(lesson); setQuestionType('posttest')
    setQuestionAiTopic(lesson.title); setQuestionAiCount(5)
    const result = await run(() => service.loadQuestions(lesson.id, 'posttest', password))
    const loaded = result?.data as AdminQuestion[] | undefined
    setQuestions(loaded?.length ? loaded : [emptyQuestion()])
  }
  const reloadQuestions = async (type: string) => {
    if (!questionLesson) return
    setQuestionType(type)
    const result = await run(() => service.loadQuestions(questionLesson.id, type, password))
    const loaded = result?.data as AdminQuestion[] | undefined
    setQuestions(loaded?.length ? loaded : [emptyQuestion()])
  }
  const updateQuestion = (index: number, update: Partial<AdminQuestion>) => setQuestions((all) => all.map((item, at) => at === index ? { ...item, ...update } : item))
  const saveQuestions = async () => {
    if (!questionLesson || questions.some((question) => !question.text.trim())) return setStatus('กรุณาระบุคำถามให้ครบ')
    const cleaned = questions.map((question) => ({ ...question, matchingPairs: question.pattern === 'matching' ? question.matchingPairs.filter((pair) => pair.left.trim() && pair.right.trim()) : [] }))
    const result = await run(() => service.saveQuestions(questionLesson.id, questionType, cleaned, password), 'บันทึกข้อสอบแล้ว')
    if (result) setQuestionLesson(null)
  }
  const studentAction = async (kind: 'reset' | 'delete' | 'unbind', student: AdminStudent) => {
    const labels = { reset: 'รีเซ็ตข้อมูล', delete: 'ลบข้อมูล', unbind: 'ปลดล็อกโปรไฟล์จากอุปกรณ์เดิมของ' } as const
    if (!confirmAction(`${labels[kind]} ${student.name}?`)) return
    const task = kind === 'reset'
      ? service.resetStudent(student.id, password)
      : kind === 'delete'
        ? service.deleteStudent(student.id, password)
        : service.unbindStudent(student.id, password)
    const result = await run(() => task, kind === 'unbind' ? 'ปลดล็อกโปรไฟล์แล้ว นักเรียนล็อกอินจากเครื่องใหม่ได้ทันที' : 'อัปเดตข้อมูลนักเรียนแล้ว')
    if (result && kind !== 'unbind') { const refreshed = await service.loadStudents(password); if (refreshed.data) setStudents(refreshed.data) }
  }
  const analyzeStudent = async (student: AdminStudent) => {
    setAnalysis({ name: student.name, text: '', loading: true })
    try {
      const result = await service.generateProgressReport(student)
      if (!result.success) throw new Error(result.error || 'วิเคราะห์ไม่สำเร็จ')
      setAnalysis({ name: student.name, text: result.answer || 'ไม่มีข้อมูลสำหรับวิเคราะห์', mode: result.mode, loading: false })
    } catch (error) {
      setAnalysis(null)
      setStatus(error instanceof Error ? error.message : 'เกิดข้อผิดพลาดระหว่างวิเคราะห์')
    }
  }

  // --- AI lesson/question generation ---------------------------------------

  const mapStyleChoices = () => MAP_ENTRANCE_TEMPLATES.map((template) => ({ id: template.id, name: template.name }))

  const generateAiLesson = async () => {
    if (!aiDraft) return
    if (!aiDraft.topic.trim()) return setAiDraft({ ...aiDraft, error: 'กรุณาระบุหัวข้อบทเรียนก่อนให้ AI สร้าง' })
    setAiDraft({ ...aiDraft, working: true, error: '' })
    try {
      const result = await service.generateLesson({
        topic: aiDraft.topic.trim(),
        gradeLevel: aiDraft.gradeLevel,
        posttestCount: aiDraft.posttestCount,
        pretestCount: aiDraft.includePretest ? aiDraft.pretestCount : 0,
        notes: aiDraft.notes.trim(),
        mapStyles: mapStyleChoices(),
      }, password)
      if (!result.success || !result.data) throw new Error(result.error || 'AI สร้างบทเรียนไม่สำเร็จ')
      setAiDraft((current) => current && { ...current, step: 'preview', bundle: result.data!, working: false, error: '' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI สร้างบทเรียนไม่สำเร็จ'
      setAiDraft((current) => current && { ...current, working: false, error: message })
    }
  }

  const saveAiLesson = async () => {
    if (!aiDraft?.bundle) return
    const bundle = aiDraft.bundle
    setAiDraft({ ...aiDraft, working: true, error: '' })
    try {
      const saved = await service.saveLesson({
        id: '',
        title: bundle.lesson.title,
        description: bundle.lesson.description,
        content: bundle.lesson.content,
        icon: bundle.lesson.icon || '🗺️',
        mapStyle: bundle.lesson.mapStyle,
        isActive: true,
        enablePretest: bundle.pretest.length > 0,
        videoUrl: '',
        worksheetUrl: '',
      }, password)
      if (!saved.success || !saved.id) throw new Error(saved.error || 'บันทึกบทเรียนไม่สำเร็จ')
      const posttest = await service.saveQuestions(saved.id, 'posttest', bundle.posttest as AdminQuestion[], password)
      if (!posttest.success) throw new Error(posttest.error || 'บันทึกข้อสอบหลังเรียนไม่สำเร็จ')
      if (bundle.pretest.length) {
        const pretest = await service.saveQuestions(saved.id, 'pretest', bundle.pretest as AdminQuestion[], password)
        if (!pretest.success) throw new Error(pretest.error || 'บันทึกข้อสอบก่อนเรียนไม่สำเร็จ')
      }
      setAiDraft(null)
      await loadLessons()
      setStatus(`สร้างด่าน "${bundle.lesson.title}" ด้วย AI เรียบร้อยแล้ว`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'บันทึกบทเรียนไม่สำเร็จ'
      setAiDraft((current) => current && { ...current, working: false, error: message })
    }
  }

  const generateAiQuestions = async () => {
    if (!questionLesson || questionAiBusy) return
    setQuestionAiBusy(true); setStatus('')
    try {
      const result = await service.generateLesson({
        topic: questionAiTopic.trim() || questionLesson.title,
        gradeLevel: 'ป.5',
        posttestCount: questionAiCount,
        pretestCount: questionAiCount,
        notes: questionLesson.description || '',
        questionsOnly: questionType === 'pretest' ? 'pretest' : 'posttest',
        mapStyles: [],
      }, password)
      if (!result.success || !result.data) throw new Error(result.error || 'AI สร้างข้อสอบไม่สำเร็จ')
      const generated = (questionType === 'pretest' ? result.data.pretest : result.data.posttest) as unknown as AdminQuestion[]
      if (!generated.length) throw new Error('AI ไม่ได้สร้างข้อสอบกลับมา กรุณาลองใหม่')
      setQuestions((current) => [...current.filter((question) => question.text.trim()), ...generated])
      setStatus(`AI สร้างข้อสอบ ${generated.length} ข้อแล้ว — ตรวจทานและแก้ไขได้ก่อนกดบันทึก`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'AI สร้างข้อสอบไม่สำเร็จ')
    } finally {
      setQuestionAiBusy(false)
    }
  }

  // --- AI (Gemini) key management -------------------------------------------

  const refreshAiSettings = async () => {
    const ai = await service.loadAiSettings(password).catch(() => null)
    setAiSettings(ai?.success && ai.data ? ai.data : { hasKey: false, maskedKey: '' })
  }

  const saveAiKey = async (event: FormEvent) => {
    event.preventDefault()
    const key = aiKeyInput.trim()
    if (!key) return setStatus('กรุณาวาง Gemini API Key ก่อนบันทึก')
    const result = await run(() => service.saveAiKey(key, password), 'บันทึก Gemini API Key แล้ว ระบบ AI พร้อมใช้งาน')
    if (result) { setAiKeyInput(''); await refreshAiSettings() }
  }

  const testAiKey = async () => {
    const key = aiKeyInput.trim()
    if (!key) return setStatus('วางคีย์ในช่องก่อนกดทดสอบการเชื่อมต่อ')
    await run(() => service.testAiKey(key), 'ทดสอบสำเร็จ คีย์นี้เชื่อมต่อ Gemini ได้แล้ว')
  }

  const clearAiKey = async () => {
    if (!confirmAction('ลบ Gemini API Key ออกจากระบบ? ฟีเจอร์ AI ทั้งหมดจะกลับสู่โหมดพื้นฐาน')) return
    const result = await run(() => service.clearAiKey(password), 'ลบคีย์แล้ว ระบบ AI กลับสู่โหมดพื้นฐาน')
    if (result) await refreshAiSettings()
  }
  const resetAll = async () => {
    const scope = classFilter ? `ในชั้น ${classFilter}` : 'ทั้งหมด'
    if (!confirmAction(`รีเซ็ตนักเรียน${scope}?`)) return
    // Second explicit confirmation: this wipes XP/coins/progress for every
    // matched student and cannot be undone without a backup file.
    if (!confirmAction(`ยืนยันอีกครั้ง: ข้อมูลความก้าวหน้า เหรียญ และ XP ของนักเรียน${scope}จะถูกลบถาวร และย้อนกลับไม่ได้หากไม่มีไฟล์สำรองข้อมูล ดำเนินการต่อหรือไม่?`)) return
    const result = await run(() => service.resetAllStudents(classFilter, password), 'รีเซ็ตข้อมูลแล้ว')
    if (result) { const refreshed = await service.loadStudents(password); if (refreshed.data) setStudents(refreshed.data) }
  }
  const savePublicSettings = async (event: FormEvent) => {
    event.preventDefault()
    const safe = { TimerPerQuestion: Math.min(300, Math.max(5, Number(settings.TimerPerQuestion) || 30)), Classes: String(settings.Classes || ''), Rooms: String(settings.Rooms || ''), CertHeader: String(settings.CertHeader || ''), CertFooter: String(settings.CertFooter || '') }
    const result = await run(() => service.saveSettings(safe, password), 'บันทึกการตั้งค่าแล้ว')
    if (result) setSettings(safe)
  }
  const saveNews = async (event: FormEvent) => {
    event.preventDefault(); if (!newsDraft?.title.trim() || !newsDraft.content.trim()) return setStatus('กรุณาระบุหัวข้อและเนื้อหา')
    const result = await run(() => service.saveNews(newsDraft, password), 'บันทึกประกาศแล้ว')
    if (result) { setNewsDraft(null); const refreshed = await service.loadNews(password); if (refreshed.data) setNews(refreshed.data) }
  }
  const deleteNews = async (item: AdminNews) => {
    if (!item.id || !confirmAction(`ลบประกาศ ${item.title}?`)) return
    const result = await run(() => service.deleteNews(item.id!, password), 'ลบประกาศแล้ว')
    if (result) setNews((all) => all.filter((newsItem) => newsItem.id !== item.id))
  }
  const loadReports = async (lessonId: string) => {
    setReportLesson(lessonId); if (!lessonId) return setReports([])
    const result = await run(() => service.loadReports(lessonId, password))
    if (result?.data) setReports(result.data as ExamReport[])
  }

  const filteredStudents = useMemo(() => students.filter((student) => !classFilter || student.class === classFilter), [students, classFilter])
  const classes = useMemo(() => [...new Set(students.map((student) => student.class))].sort(), [students])
  const summary = reportSummary(reports)

  if (!authenticated) return <section id="page-admin" className="hidden min-h-[75vh] flex-1 items-center justify-center p-5">
    <form onSubmit={login} className="w-full max-w-md rounded-3xl border border-white/50 bg-white/90 p-8 text-center shadow-2xl backdrop-blur">
      <div className="mb-3 text-6xl">🛡️</div><h1 className="text-3xl font-black text-indigo-700">ผู้ดูแลระบบ</h1><p className="mb-6 text-slate-500">เข้าสู่ระบบด้วยบัญชี Firebase Admin</p>
      <label className="block text-left font-bold">รหัสผ่านผู้ดูแลระบบ<input aria-label="รหัสผ่านผู้ดูแลระบบ" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className={`${fieldClass} mt-2`} required /></label>
      {loginError && <p role="alert" className="mt-3 text-red-600">{loginError}</p>}
      <div className="mt-6 flex gap-3"><button className={`${primary} flex-1`} disabled={busy}>เข้าสู่ระบบ</button><button type="button" className={secondary} onClick={onExit}>ยกเลิก</button></div>
    </form>
  </section>

  return <section id="page-admin" style={{ display: 'block' }} className="min-h-screen w-full overflow-y-auto p-4 md:p-7">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-gradient-to-r from-indigo-700 to-purple-700 p-5 text-white shadow-xl">
      <div><h1 className="text-2xl font-black md:text-3xl">ศูนย์บัญชาการผู้ดูแลระบบ</h1><p className="text-indigo-100">จัดการข้อมูลผ่าน Firestore โดยตรง</p></div>
      <button type="button" className="rounded-xl bg-white/20 px-4 py-2 font-bold hover:bg-white/30" onClick={logout}>ออกจากระบบ</button>
    </header>
    <nav className="mb-5 flex flex-wrap gap-2">{([['lessons', '📚', 'บทเรียน'], ['daily', '📜', 'ภารกิจรายวัน'], ['cyber', '🛡️', 'ไซเบอร์'], ['students', '🧑‍🎓', 'นักเรียน'], ['reports', '📊', 'รายงาน'], ['settings', '⚙️', 'ตั้งค่า'], ['news', '📢', 'ประกาศ']] as Array<[Tab, string, string]>).map(([id, icon, label]) => <button type="button" key={id} onClick={() => void changeTab(id)} className={`${tab === id ? primary : secondary}`}><span aria-hidden="true">{icon}</span> {label}</button>)}</nav>
    {status && <p role="status" className={`mb-4 rounded-xl p-3 font-bold ${status.includes('แล้ว') ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{status}</p>}
    {busy && <p className="mb-4 text-indigo-700">กำลังดำเนินการ...</p>}

    {tab === 'lessons' && <div className="rounded-3xl bg-white/90 p-5 shadow-xl"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-black text-slate-800">บทเรียน</h2><div className="flex flex-wrap gap-2"><button aria-label="สร้างบทเรียนด้วย AI" className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 px-4 py-2 font-bold text-white shadow hover:brightness-110" onClick={() => setAiDraft(emptyAiDraft())}>✨ สร้างด้วย AI</button><button className={primary} onClick={() => setLessonDraft(emptyLesson())}>เพิ่มบทเรียน</button></div></div>
      <div className="grid gap-3">{lessons.map((item, index) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"><div className="flex items-center gap-3"><span className="block h-12 w-12 shrink-0" aria-hidden="true">{(() => { const Entrance = entranceTemplateForLesson(item.mapStyle, index).Art; return <Entrance /> })()}</span><span className="text-3xl">{item.icon}</span><div><h3 className="font-black">{item.title}</h3><p className="text-sm text-slate-500">{item.id} · {item.questionCount || 0} ข้อ · {item.isActive === false ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</p></div></div><div className="flex flex-wrap gap-2"><button className={secondary} onClick={() => void openQuestions(item)} aria-label={`จัดการข้อสอบ ${item.title}`}>ข้อสอบ</button><button className={secondary} onClick={() => setLessonDraft({ ...item })} aria-label={`แก้ไข ${item.title}`}>แก้ไข</button><button className="rounded-xl bg-red-100 px-3 py-2 font-bold text-red-700" onClick={() => void deleteLesson(item)} aria-label={`ลบ ${item.title}`}>ลบ</button></div></article>)}</div>
    </div>}

    {tab === 'daily' && <div className="rounded-3xl bg-white/90 p-5 shadow-xl">
      <div className="mb-1 flex items-center justify-between"><h2 className="text-2xl font-black text-slate-800">ภารกิจรายวัน</h2></div>
      <p className="mb-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">ปรับชื่อ เป้าหมาย และรางวัลของภารกิจทั้ง 3 ประเภทได้ (ตัวนับความคืบหน้า: เช็คอิน / เข้าเล่นด่าน / ตอบถูกสะสม) — นักเรียนเห็นผลทันทีที่เปิดหน้าหลักครั้งถัดไป</p>
      <div className="grid gap-3">{dailyQuests.map((quest) => <article key={quest.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
        <div className="flex items-center gap-3"><span className="text-3xl">{quest.id === 'login' ? '🪙' : quest.id === 'play1' ? '👟' : '💬'}</span><div>
          <h3 className="font-black">{quest.title} {quest.isActive === false && <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-500">ปิดใช้งาน</span>}</h3>
          <p className="text-sm text-slate-500">{quest.description}</p>
          <p className="text-xs font-bold text-amber-700">เป้าหมาย {quest.target} ครั้ง · รางวัล {quest.coins > 0 ? `${quest.coins} Coins` : ''}{quest.coins > 0 && quest.xp > 0 ? ' + ' : ''}{quest.xp > 0 ? `${quest.xp} XP` : ''}</p>
        </div></div>
        <button className={secondary} onClick={() => setDailyDraft({ ...quest })} aria-label={`แก้ไขภารกิจ ${quest.title}`}>แก้ไข</button>
      </article>)}</div>
    </div>}

    {tab === 'cyber' && <div className="rounded-3xl bg-white/90 p-5 shadow-xl">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-2xl font-black text-slate-800">สถานการณ์ Cyber Safety</h2><button className={primary} onClick={() => setScenarioDraft(emptyCyberScenario())}>เพิ่มสถานการณ์</button></div>
      <div className="grid gap-3">{cyberScenarios.map((scenario) => <article key={scenario.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border p-4">
        <div className="min-w-0 flex-1"><h3 className="font-black">🛡️ {scenario.title || scenario.id} <span className="text-xs font-bold text-slate-400">({scenario.id}{scenario.timeOfDay ? ` · ${scenario.timeOfDay}` : ''})</span></h3>
          <p className="text-sm text-slate-600">{scenario.text}</p>
          <p className="text-xs font-bold text-emerald-700">✓ {scenario.answerIdx === 0 ? scenario.opt1 : scenario.opt2}</p></div>
        <div className="flex gap-2"><button className={secondary} onClick={() => setScenarioDraft({ ...scenario })} aria-label={`แก้ไขสถานการณ์ ${scenario.title || scenario.id}`}>แก้ไข</button><button className="rounded-xl bg-red-100 px-3 py-2 font-bold text-red-700" onClick={() => void deleteCyberScenario(scenario)} aria-label={`ลบสถานการณ์ ${scenario.title || scenario.id}`}>ลบ</button></div>
      </article>)}
      {cyberScenarios.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-slate-500">ยังไม่มีสถานการณ์ในระบบ</p>}</div>
    </div>}

    {tab === 'students' && <div className="rounded-3xl bg-white/90 p-5 shadow-xl"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-black">นักเรียน</h2><div className="flex gap-2"><select aria-label="กรองชั้นเรียน" className={fieldClass} value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="">ทุกชั้น</option>{classes.map((item) => <option key={item}>{item}</option>)}</select><button className="rounded-xl bg-red-600 px-3 py-2 font-bold text-white" onClick={() => void resetAll()}>รีเซ็ตทั้งหมด</button></div></div>
      <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b"><th className="p-2">นักเรียน</th><th>ชั้น</th><th>XP / Rank</th><th>บทเรียนปัจจุบัน</th><th>จัดการ</th></tr></thead><tbody>{filteredStudents.map((item) => <tr key={item.id} className="border-b"><td className="p-2 font-bold">{item.avatar} {item.name}</td><td>{item.class}</td><td>{item.xp || 0} / {item.rank || '-'}</td><td>{item.currentLesson || '-'}</td><td className="flex flex-wrap gap-1 py-2"><button className={secondary} onClick={() => void analyzeStudent(item)} aria-label={`วิเคราะห์ ${item.name}`}>วิเคราะห์</button><button className={secondary} onClick={() => void studentAction('reset', item)} aria-label={`รีเซ็ต ${item.name}`}>รีเซ็ต</button><button className={secondary} onClick={() => void studentAction('unbind', item)} aria-label={`ปลดล็อกอุปกรณ์ ${item.name}`}>ปลดล็อกอุปกรณ์</button><button className="rounded-lg bg-red-100 px-2 text-red-700" onClick={() => void studentAction('delete', item)} aria-label={`ลบ ${item.name}`}>ลบ</button></td></tr>)}</tbody></table></div>
    </div>}

    {tab === 'settings' && <div className="mx-auto grid max-w-3xl gap-5">
      <form onSubmit={savePublicSettings} className="rounded-3xl bg-white/90 p-6 shadow-xl"><h2 className="mb-4 text-2xl font-black">การตั้งค่าสาธารณะ</h2><div className="grid gap-4 md:grid-cols-2">
        <label className="font-bold">เวลาต่อข้อ (วินาที)<input aria-label="เวลาต่อข้อ (วินาที)" type="number" min="5" max="300" className={fieldClass} value={Number(settings.TimerPerQuestion) || 30} onChange={(event) => setSettings({ ...settings, TimerPerQuestion: Number(event.target.value) })} /></label>
        <label className="font-bold">ชั้นเรียน (คั่นด้วยจุลภาค)<input className={fieldClass} value={String(settings.Classes || '')} onChange={(event) => setSettings({ ...settings, Classes: event.target.value })} /></label>
        <label className="font-bold">ห้องเรียน (คั่นด้วยจุลภาค)<input className={fieldClass} value={String(settings.Rooms || '')} onChange={(event) => setSettings({ ...settings, Rooms: event.target.value })} /></label>
        <label className="font-bold">หัวใบประกาศ<input className={fieldClass} value={String(settings.CertHeader || '')} onChange={(event) => setSettings({ ...settings, CertHeader: event.target.value })} /></label>
        <label className="font-bold md:col-span-2">ท้ายใบประกาศ<input className={fieldClass} value={String(settings.CertFooter || '')} onChange={(event) => setSettings({ ...settings, CertFooter: event.target.value })} /></label>
      </div><p className="my-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">รหัสผ่านผู้ดูแล (Admin PIN) ไม่ถูกเก็บหรือแสดงในหน้านี้ และจะไม่ถูกบันทึกลงการตั้งค่าสาธารณะ</p><button className={primary}>บันทึกการตั้งค่า</button></form>

      <form onSubmit={saveAiKey} className="rounded-3xl bg-white/90 p-6 shadow-xl">
        <div className="mb-1 flex flex-wrap items-center gap-3"><h2 className="text-2xl font-black">🤖 ระบบ AI (Gemini)</h2>
          {aiSettings === null
            ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">กำลังตรวจสอบ...</span>
            : aiSettings.hasKey
              ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">● เชื่อมต่อแล้ว (คีย์ {aiSettings.maskedKey})</span>
              : <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">○ ยังไม่ได้ตั้งค่า — ทำงานโหมดพื้นฐาน</span>}
        </div>
        <p className="mb-4 text-sm text-slate-500">คีย์นี้เปิดใช้ 3 ระบบ: แชทบอทติวเตอร์ของนักเรียน · AI วิเคราะห์นักเรียน · AI สร้างบทเรียนและข้อสอบ</p>
        <label className="block font-bold">Gemini API Key<input aria-label="Gemini API Key" type="password" autoComplete="off" placeholder="วางคีย์จาก Google AI Studio (aistudio.google.com)" className={`${fieldClass} mt-1`} value={aiKeyInput} onChange={(event) => setAiKeyInput(event.target.value)} /></label>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className={primary} disabled={busy}>บันทึกคีย์</button>
          <button type="button" className={secondary} disabled={busy} onClick={() => void testAiKey()}>ทดสอบคีย์</button>
          {aiSettings?.hasKey && <button type="button" className="rounded-xl bg-red-100 px-3 py-2 font-bold text-red-700 hover:bg-red-200" onClick={() => void clearAiKey()}>ลบคีย์</button>}
        </div>
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">🔐 คีย์ถูกเก็บใน Firestore (เอกสาร settings/ai) อ่านได้เฉพาะผู้ใช้ที่ล็อกอินแอปนี้ และแก้ไขได้เฉพาะผู้ดูแลระบบ — เพื่อความปลอดภัยสูงสุด แนะนำให้จำกัดคีย์ให้ใช้ได้เฉพาะโดเมนของเว็บนี้ (Application restrictions → HTTP referrers) ใน Google Cloud Console</p>
      </form>
    </div>}

    {tab === 'news' && <div className="rounded-3xl bg-white/90 p-5 shadow-xl"><div className="mb-4 flex justify-between"><h2 className="text-2xl font-black">ประกาศ</h2><button className={primary} onClick={() => setNewsDraft(emptyNews())}>เพิ่มประกาศ</button></div>{news.map((item) => <article key={item.id} className="mb-3 flex items-start justify-between gap-3 rounded-2xl border p-4"><div><h3 className="font-black">{item.icon} {item.title}</h3><p>{item.content}</p><small>{item.type} · {item.date} · {item.isActive === false ? 'ปิด' : 'เผยแพร่'}</small></div><div className="flex gap-2"><button className={secondary} onClick={() => setNewsDraft({ ...item })}>แก้ไข</button><button className="text-red-600" onClick={() => void deleteNews(item)} aria-label={`ลบประกาศ ${item.title}`}>ลบ</button></div></article>)}</div>}

    {tab === 'reports' && <div className="rounded-3xl bg-white/90 p-5 shadow-xl"><div className="mb-4 flex flex-wrap items-end gap-3"><label className="font-bold">เลือกบทเรียนสำหรับรายงาน<select aria-label="เลือกบทเรียนสำหรับรายงาน" className={fieldClass} value={reportLesson} onChange={(event) => void loadReports(event.target.value)}><option value="">เลือกบทเรียน</option>{lessons.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>{reports.length > 0 && <button className={secondary} onClick={() => downloadCsv(reportsToCsv(reports))}>ดาวน์โหลด CSV</button>}</div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3"><b className="rounded-xl bg-indigo-50 p-3">ผู้เข้าสอบ {summary.count}</b><b className="rounded-xl bg-emerald-50 p-3">คะแนนเฉลี่ย {summary.average}</b><b className="rounded-xl bg-amber-50 p-3">คะแนนสูงสุด {summary.highest}</b></div>
      <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>วันที่</th><th>ชื่อ</th><th>ชั้น</th><th>คะแนน</th><th>สถานะ</th></tr></thead><tbody>{reports.map((item, index) => <tr key={`${item.name}-${index}`} className="border-t"><td>{item.timestamp}</td><td>{item.name}</td><td>{item.class}</td><td>{item.score}/{item.totalQuestions}</td><td>{item.status}</td></tr>)}</tbody></table></div>
    </div>}

    {lessonDraft && <Modal label="จัดการบทเรียน" onClose={() => setLessonDraft(null)}><form onSubmit={saveLesson} className="grid gap-3 md:grid-cols-2">
      <label className="font-bold md:col-span-2">ชื่อบทเรียน<input aria-label="ชื่อบทเรียน" className={fieldClass} value={lessonDraft.title} onChange={(event) => setLessonDraft({ ...lessonDraft, title: event.target.value })} required /></label>
      <label>ไอคอน<input className={fieldClass} value={lessonDraft.icon || ''} onChange={(event) => setLessonDraft({ ...lessonDraft, icon: event.target.value })} /></label><label>URL วิดีโอ<input className={fieldClass} value={lessonDraft.videoUrl || ''} onChange={(event) => setLessonDraft({ ...lessonDraft, videoUrl: event.target.value })} /></label>
      <fieldset className="md:col-span-2">
        <legend className="mb-2 font-bold">ทางเข้าด่านบนแผนที่ผจญภัย</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          <label className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 p-2 text-center ${!lessonDraft.mapStyle ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-400'}`}>
            <input type="radio" name="lesson-map-style" className="sr-only" aria-label="เทมเพลต อัตโนมัติตามลำดับด่าน" checked={!lessonDraft.mapStyle} onChange={() => setLessonDraft({ ...lessonDraft, mapStyle: '' })} />
            <span className="grid h-12 w-12 place-items-center text-3xl" aria-hidden="true">🎲</span>
            <small className="text-[10px] font-bold leading-tight text-slate-600">อัตโนมัติ</small>
          </label>
          {MAP_ENTRANCE_TEMPLATES.map((template) => (
            <label key={template.id} className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 p-2 text-center ${lessonDraft.mapStyle === template.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-400'}`}>
              <input type="radio" name="lesson-map-style" className="sr-only" aria-label={`เทมเพลต ${template.name}`} checked={lessonDraft.mapStyle === template.id} onChange={() => setLessonDraft({ ...lessonDraft, mapStyle: template.id })} />
              <span className="block h-12 w-12" aria-hidden="true"><template.Art /></span>
              <small className="text-[10px] font-bold leading-tight text-slate-600">{template.name}</small>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="md:col-span-2">คำอธิบาย<textarea className={fieldClass} value={lessonDraft.description || ''} onChange={(event) => setLessonDraft({ ...lessonDraft, description: event.target.value })} /></label><label className="md:col-span-2">เนื้อหา<textarea rows={6} className={fieldClass} value={lessonDraft.content || ''} onChange={(event) => setLessonDraft({ ...lessonDraft, content: event.target.value })} /></label><label className="md:col-span-2">URL ใบงาน<input className={fieldClass} value={lessonDraft.worksheetUrl || ''} onChange={(event) => setLessonDraft({ ...lessonDraft, worksheetUrl: event.target.value })} /></label>
      <label><input type="checkbox" checked={lessonDraft.isActive !== false} onChange={(event) => setLessonDraft({ ...lessonDraft, isActive: event.target.checked })} /> เปิดใช้งาน</label><label><input type="checkbox" checked={lessonDraft.enablePretest === true} onChange={(event) => setLessonDraft({ ...lessonDraft, enablePretest: event.target.checked })} /> มี Pretest</label>
      <div className="md:col-span-2 flex gap-2"><button className={primary}>บันทึกบทเรียน</button><button type="button" className={secondary} onClick={() => setLessonDraft(null)}>ยกเลิก</button></div>
    </form></Modal>}

    {questionLesson && <Modal label={`จัดการข้อสอบ: ${questionLesson.title}`} onClose={() => setQuestionLesson(null)}><div className="mb-4 flex flex-wrap gap-2"><select aria-label="ประเภทข้อสอบ" className={fieldClass} value={questionType} onChange={(event) => void reloadQuestions(event.target.value)}><option value="posttest">Posttest</option><option value="pretest">Pretest</option></select><button className={secondary} onClick={() => setQuestions((all) => [...all, emptyQuestion()])}>เพิ่มข้อ</button></div>
      <div className="mb-4 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/70 p-4">
        <p className="mb-2 text-sm font-black text-indigo-700">✨ ผู้ช่วย AI — สร้างข้อสอบ{questionType === 'pretest' ? 'ก่อนเรียน (Pretest)' : 'หลังเรียน (Posttest)'}อัตโนมัติ</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1 text-sm font-bold">หัวข้อ<input aria-label="หัวข้อสำหรับสร้างข้อสอบ AI" className={fieldClass} value={questionAiTopic} onChange={(event) => setQuestionAiTopic(event.target.value)} /></label>
          <label className="text-sm font-bold">จำนวนข้อ<select aria-label="จำนวนข้อสอบ AI" className={fieldClass} value={questionAiCount} onChange={(event) => setQuestionAiCount(Number(event.target.value))}>{[3, 5, 10, 15, 20].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <button type="button" aria-label="สร้างข้อสอบด้วย AI" className={primary} disabled={questionAiBusy} onClick={() => void generateAiQuestions()}>{questionAiBusy ? '🤖 กำลังสร้าง...' : 'สร้างด้วย AI'}</button>
        </div>
        <p className="mt-2 text-xs text-indigo-500">ข้อสอบที่ AI สร้างจะเติมลงในแบบร่างด้านล่าง ตรวจทาน/แก้ไขได้ก่อนกดบันทึกจริง</p>
      </div>
      {questions.map((question, index) => <div key={index} className="mb-4 rounded-2xl border p-4"><div className="mb-2 flex justify-between"><b>ข้อ {index + 1}</b>{questions.length > 1 && <button className="text-red-600" onClick={() => setQuestions((all) => all.filter((_, at) => at !== index))}>ลบข้อ</button>}</div>
        <label>คำถาม<input aria-label={`คำถามข้อ ${index + 1}`} className={fieldClass} value={question.text} onChange={(event) => updateQuestion(index, { text: event.target.value })} /></label><label>รูปแบบ<select aria-label={`รูปแบบข้อ ${index + 1}`} className={fieldClass} value={question.pattern} onChange={(event) => updateQuestion(index, { pattern: event.target.value as AdminQuestion['pattern'] })}><option value="choice">ตัวเลือก</option><option value="matching">จับคู่</option></select></label>
        {question.pattern === 'choice' ? <div className="grid gap-2 md:grid-cols-2">{question.options.map((option, optionIndex) => <label key={optionIndex}>ตัวเลือก {optionIndex + 1}<input aria-label={`ตัวเลือก ${optionIndex + 1} ข้อ ${index + 1}`} className={fieldClass} value={option} onChange={(event) => updateQuestion(index, { options: question.options.map((item, at) => at === optionIndex ? event.target.value : item) })} /></label>)}<label>คำตอบที่ถูก<select className={fieldClass} value={Number(question.answer) || 1} onChange={(event) => updateQuestion(index, { answer: Number(event.target.value) })}>{[1, 2, 3, 4].map((value) => <option key={value}>{value}</option>)}</select></label></div> : <div>{question.matchingPairs.map((pair, pairIndex) => <div className="grid grid-cols-2 gap-2" key={pairIndex}><input aria-label={`ด้านซ้ายคู่ ${pairIndex + 1} ข้อ ${index + 1}`} className={fieldClass} value={pair.left} onChange={(event) => updateQuestion(index, { matchingPairs: question.matchingPairs.map((item, at) => at === pairIndex ? { ...item, left: event.target.value } : item) })} /><input aria-label={`ด้านขวาคู่ ${pairIndex + 1} ข้อ ${index + 1}`} className={fieldClass} value={pair.right} onChange={(event) => updateQuestion(index, { matchingPairs: question.matchingPairs.map((item, at) => at === pairIndex ? { ...item, right: event.target.value } : item) })} /></div>)}<button className={secondary} onClick={() => updateQuestion(index, { matchingPairs: [...question.matchingPairs, { left: '', right: '' }] })}>เพิ่มคู่</button></div>}
        <label>คำอธิบาย<textarea className={fieldClass} value={question.explanation} onChange={(event) => updateQuestion(index, { explanation: event.target.value })} /></label><label>URL รูปภาพ<input className={fieldClass} value={question.image} onChange={(event) => updateQuestion(index, { image: event.target.value })} /></label>
      </div>)}<div className="flex gap-2"><button className={primary} onClick={() => void saveQuestions()}>บันทึกข้อสอบ</button><button className={secondary} onClick={() => setQuestionLesson(null)}>ยกเลิก</button></div>
    </Modal>}

    {newsDraft && <Modal label="จัดการประกาศ" onClose={() => setNewsDraft(null)}><form onSubmit={saveNews} className="grid gap-3"><label>หัวข้อประกาศ<input aria-label="หัวข้อประกาศ" className={fieldClass} value={newsDraft.title} onChange={(event) => setNewsDraft({ ...newsDraft, title: event.target.value })} /></label><label>เนื้อหาประกาศ<textarea aria-label="เนื้อหาประกาศ" className={fieldClass} value={newsDraft.content} onChange={(event) => setNewsDraft({ ...newsDraft, content: event.target.value })} /></label><div className="grid grid-cols-2 gap-3"><label>ไอคอน<input className={fieldClass} value={newsDraft.icon || ''} onChange={(event) => setNewsDraft({ ...newsDraft, icon: event.target.value })} /></label><label>ประเภท<input className={fieldClass} value={newsDraft.type || ''} onChange={(event) => setNewsDraft({ ...newsDraft, type: event.target.value })} /></label></div><label><input type="checkbox" checked={newsDraft.isActive !== false} onChange={(event) => setNewsDraft({ ...newsDraft, isActive: event.target.checked })} /> เผยแพร่</label><button className={primary}>บันทึกประกาศ</button></form></Modal>}
    {dailyDraft && <Modal label={`แก้ไขภารกิจ: ${dailyDraft.id}`} onClose={() => setDailyDraft(null)}><form onSubmit={saveDailyQuest} className="grid gap-3 md:grid-cols-2">
      <label className="font-bold md:col-span-2">ชื่อภารกิจ<input aria-label="ชื่อภารกิจ" className={fieldClass} value={dailyDraft.title} onChange={(event) => setDailyDraft({ ...dailyDraft, title: event.target.value })} required /></label>
      <label className="md:col-span-2">คำอธิบาย<input aria-label="คำอธิบายภารกิจ" className={fieldClass} value={dailyDraft.description} onChange={(event) => setDailyDraft({ ...dailyDraft, description: event.target.value })} /></label>
      <label>เป้าหมาย (ครั้ง)<input aria-label="เป้าหมายภารกิจ" type="number" min="1" max="50" className={fieldClass} value={dailyDraft.target} onChange={(event) => setDailyDraft({ ...dailyDraft, target: Number(event.target.value) || 1 })} /></label>
      <label>รางวัล Coins<input aria-label="รางวัลเหรียญ" type="number" min="0" max="500" className={fieldClass} value={dailyDraft.coins} onChange={(event) => setDailyDraft({ ...dailyDraft, coins: Number(event.target.value) || 0 })} /></label>
      <label>รางวัล XP<input aria-label="รางวัล XP" type="number" min="0" max="500" className={fieldClass} value={dailyDraft.xp} onChange={(event) => setDailyDraft({ ...dailyDraft, xp: Number(event.target.value) || 0 })} /></label>
      <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={dailyDraft.isActive !== false} onChange={(event) => setDailyDraft({ ...dailyDraft, isActive: event.target.checked })} /> เปิดใช้งานภารกิจนี้</label>
      <p className="md:col-span-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">ตัวนับความคืบหน้าผูกกับประเภทภารกิจ ({dailyDraft.id}) — เปลี่ยนชื่อ/เป้า/รางวัลได้ แต่พฤติกรรมการนับคงเดิม</p>
      <div className="md:col-span-2 flex gap-2"><button className={primary}>บันทึกภารกิจ</button><button type="button" className={secondary} onClick={() => setDailyDraft(null)}>ยกเลิก</button></div>
    </form></Modal>}

    {scenarioDraft && <Modal label="จัดการสถานการณ์ไซเบอร์" onClose={() => setScenarioDraft(null)}><form onSubmit={saveCyberScenario} className="grid gap-3 md:grid-cols-2">
      <label className="font-bold">หัวข้อ<input aria-label="หัวข้อสถานการณ์" className={fieldClass} value={scenarioDraft.title} onChange={(event) => setScenarioDraft({ ...scenarioDraft, title: event.target.value })} /></label>
      <label>ช่วงเวลา (เช้า/กลางวัน/เย็น)<input aria-label="ช่วงเวลาสถานการณ์" className={fieldClass} value={scenarioDraft.timeOfDay || ''} onChange={(event) => setScenarioDraft({ ...scenarioDraft, timeOfDay: event.target.value })} /></label>
      <label className="md:col-span-2">สถานการณ์<textarea aria-label="ข้อความสถานการณ์" rows={3} className={fieldClass} value={scenarioDraft.text} onChange={(event) => setScenarioDraft({ ...scenarioDraft, text: event.target.value })} required /></label>
      <label>ตัวเลือกที่ 1<input aria-label="ตัวเลือกที่ 1" className={fieldClass} value={scenarioDraft.opt1} onChange={(event) => setScenarioDraft({ ...scenarioDraft, opt1: event.target.value })} required /></label>
      <label>ตัวเลือกที่ 2<input aria-label="ตัวเลือกที่ 2" className={fieldClass} value={scenarioDraft.opt2} onChange={(event) => setScenarioDraft({ ...scenarioDraft, opt2: event.target.value })} required /></label>
      <label>คำตอบที่ถูกต้อง<select aria-label="คำตอบที่ถูกต้อง" className={fieldClass} value={scenarioDraft.answerIdx} onChange={(event) => setScenarioDraft({ ...scenarioDraft, answerIdx: Number(event.target.value) })}><option value={0}>ตัวเลือกที่ 1</option><option value={1}>ตัวเลือกที่ 2</option></select></label>
      <label>ข้อความเมื่อตอบถูก<input aria-label="ข้อความเมื่อตอบถูก" className={fieldClass} value={scenarioDraft.feedbackRight || ''} onChange={(event) => setScenarioDraft({ ...scenarioDraft, feedbackRight: event.target.value })} /></label>
      <label className="md:col-span-2">ข้อความเมื่อตอบผิด<input aria-label="ข้อความเมื่อตอบผิด" className={fieldClass} value={scenarioDraft.feedbackWrong || ''} onChange={(event) => setScenarioDraft({ ...scenarioDraft, feedbackWrong: event.target.value })} /></label>
      <div className="md:col-span-2 flex gap-2"><button className={primary}>บันทึกสถานการณ์</button><button type="button" className={secondary} onClick={() => setScenarioDraft(null)}>ยกเลิก</button></div>
    </form></Modal>}

    {analysis && <Modal label="รายงานวิเคราะห์นักเรียน" onClose={() => setAnalysis(null)}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-black text-slate-800">🧑‍🎓 {analysis.name}</h3>
        {analysis.mode === 'gemini' && <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">✨ วิเคราะห์โดย Gemini AI</span>}
        {analysis.mode === 'local-fallback' && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">รายงานพื้นฐาน (ยังไม่เชื่อม AI)</span>}
      </div>
      {analysis.loading
        ? <p className="animate-pulse rounded-2xl bg-indigo-50 p-8 text-center font-bold text-indigo-600">🤖 AI กำลังวิเคราะห์ข้อมูลนักเรียน...</p>
        : <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-800"><MarkdownLite text={analysis.text} /></div>}
      <button className={`${primary} mt-4`} onClick={() => setAnalysis(null)}>ปิดรายงาน</button>
    </Modal>}

    {aiDraft && <Modal label="สร้างบทเรียนด้วย AI" onClose={() => !aiDraft.working && setAiDraft(null)}>
      {aiDraft.step === 'form' && <div>
        <p className="mb-4 rounded-2xl bg-gradient-to-r from-fuchsia-50 to-indigo-50 p-4 text-sm text-indigo-800">🧙‍♂️ บอกหัวข้อที่จะสอน แล้ว AI จะออกแบบ <b>ด่านผจญภัยทั้งด่าน</b> ให้ครบ: เนื้อหาบทเรียน + ข้อสอบก่อนเรียน/หลังเรียน + ไอคอนและธีมทางเข้าด่าน — ครูตรวจทานก่อนบันทึกได้ทุกจุด</p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="font-bold md:col-span-2">หัวข้อ/เรื่องที่จะสอน<input aria-label="หัวข้อบทเรียน AI" className={fieldClass} value={aiDraft.topic} placeholder="เช่น ระบบสุริยะ, การใช้อินเทอร์เน็ตอย่างปลอดภัย" onChange={(event) => setAiDraft({ ...aiDraft, topic: event.target.value })} required /></label>
          <label className="font-bold">ระดับชั้น<select aria-label="ระดับชั้น AI" className={fieldClass} value={aiDraft.gradeLevel} onChange={(event) => setAiDraft({ ...aiDraft, gradeLevel: event.target.value })}>{['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3'].map((grade) => <option key={grade}>{grade}</option>)}</select></label>
          <label className="font-bold">จำนวนข้อสอบหลังเรียน<select aria-label="จำนวนข้อสอบหลังเรียน" className={fieldClass} value={aiDraft.posttestCount} onChange={(event) => setAiDraft({ ...aiDraft, posttestCount: Number(event.target.value) })}>{[5, 10, 15, 20].map((value) => <option key={value} value={value}>{value} ข้อ</option>)}</select></label>
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={aiDraft.includePretest} onChange={(event) => setAiDraft({ ...aiDraft, includePretest: event.target.checked })} /> สร้างข้อสอบก่อนเรียน (Pretest)</label>
          <label className="font-bold">จำนวนข้อ Pretest<select aria-label="จำนวนข้อสอบก่อนเรียน" className={fieldClass} disabled={!aiDraft.includePretest} value={aiDraft.pretestCount} onChange={(event) => setAiDraft({ ...aiDraft, pretestCount: Number(event.target.value) })}>{[3, 5, 10].map((value) => <option key={value} value={value}>{value} ข้อ</option>)}</select></label>
          <label className="md:col-span-2">แนวทางเพิ่มเติมถึง AI (ถ้ามี)<textarea aria-label="แนวทางเพิ่มเติม AI" rows={2} className={fieldClass} placeholder="เช่น เน้นตัวอย่างในชีวิตประจำวัน, มีศัพท์ภาษาอังกฤษกำกับ" value={aiDraft.notes} onChange={(event) => setAiDraft({ ...aiDraft, notes: event.target.value })} /></label>
        </div>
        {aiDraft.error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 font-bold text-red-700">{aiDraft.error}</p>}
        {aiDraft.working
          ? <p className="mt-4 animate-pulse rounded-2xl bg-indigo-50 p-6 text-center font-bold text-indigo-600">🤖 AI กำลังออกแบบด่านผจญภัยทั้งด่าน... อาจใช้เวลา 20-60 วินาที</p>
          : <div className="mt-4 flex gap-2"><button type="button" aria-label="ให้ AI สร้างบทเรียน" className={primary} onClick={() => void generateAiLesson()}>✨ สร้างบทเรียน</button><button type="button" className={secondary} onClick={() => setAiDraft(null)}>ยกเลิก</button></div>}
      </div>}

      {aiDraft.step === 'preview' && aiDraft.bundle && <div>
        <div className="mb-4 rounded-2xl border-2 border-indigo-100 bg-gradient-to-r from-indigo-50 to-purple-50 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="block h-14 w-14 shrink-0" aria-hidden="true">{(() => { const Entrance = entranceTemplateForLesson(aiDraft.bundle.lesson.mapStyle, lessons.length).Art; return <Entrance /> })()}</span>
            <span className="text-4xl">{aiDraft.bundle.lesson.icon}</span>
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-black text-indigo-800">{aiDraft.bundle.lesson.title}</h3>
              <p className="text-sm text-slate-600">{aiDraft.bundle.lesson.description}</p>
            </div>
          </div>
          <div className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white/80 p-4 text-sm leading-relaxed text-slate-700">{aiDraft.bundle.lesson.content}</div>
        </div>
        {([['pretest', '📝 ข้อสอบก่อนเรียน (Pretest)'], ['posttest', '🏆 ข้อสอบหลังเรียน (Posttest)']] as const).map(([type, label]) => {
          const items = aiDraft.bundle![type]
          if (!items.length) return null
          return <section key={type} className="mb-4">
            <h4 className="mb-2 font-black text-slate-700">{label} · {items.length} ข้อ</h4>
            <div className="grid gap-2">{items.map((question, index) => <article key={index} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
              <p className="font-bold text-slate-800">{index + 1}. {question.text}</p>
              <div className="mt-1 grid gap-1 md:grid-cols-2">{question.options.map((option, optionIndex) => <p key={optionIndex} className={optionIndex + 1 === question.answer ? 'rounded-lg bg-emerald-50 px-2 py-1 font-bold text-emerald-700' : 'px-2 py-1 text-slate-600'}>{optionIndex + 1 === question.answer ? '✓ ' : ''}{option}</p>)}</div>
              {question.explanation && <p className="mt-1 text-xs text-slate-500">เฉลย: {question.explanation}</p>}
            </article>)}</div>
          </section>
        })}
        {aiDraft.error && <p role="alert" className="mt-2 rounded-xl bg-red-50 p-3 font-bold text-red-700">{aiDraft.error}</p>}
        {aiDraft.working
          ? <p className="mt-3 animate-pulse rounded-2xl bg-indigo-50 p-5 text-center font-bold text-indigo-600">💾 กำลังบันทึกด่านลงระบบ...</p>
          : <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" aria-label="บันทึกบทเรียน AI ลงระบบ" className={primary} onClick={() => void saveAiLesson()}>💾 บันทึกลงระบบ</button>
            <button type="button" className={secondary} onClick={() => setAiDraft({ ...aiDraft, step: 'form', bundle: null, error: '' })}>🔄 สร้างใหม่</button>
            <button type="button" className={secondary} onClick={() => setAiDraft(null)}>ยกเลิก</button>
          </div>}
      </div>}
    </Modal>}
  </section>
}

function defaultDownload(csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'exam-report.csv'; anchor.click(); URL.revokeObjectURL(url)
}
