import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { reportSummary, reportsToCsv, type ExamReport } from './adminPanelLogic'

type Result<T = unknown> = { success: boolean; data?: T; error?: string; isValid?: boolean; answer?: string; count?: number; id?: string }

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
  resetAllStudents(className: string, password: string): Promise<Result>
  loadSettings(): Promise<Result<Record<string, unknown>>>
  saveSettings(settings: Record<string, unknown>, password: string): Promise<Result>
  loadNews(password: string): Promise<Result<AdminNews[]>>
  saveNews(news: AdminNews, password: string): Promise<Result>
  deleteNews(id: string, password: string): Promise<Result>
  loadReports(lessonId: string, password: string): Promise<Result<ExamReport[]>>
  generateProgressReport(student: AdminStudent): Promise<Result>
}

type Tab = 'lessons' | 'students' | 'reports' | 'settings' | 'news'

const emptyLesson = (): AdminLesson => ({ id: '', title: '', description: '', videoUrl: '', icon: '🗺️', isActive: true, enablePretest: false, worksheetUrl: '', content: '' })
const emptyQuestion = (): AdminQuestion => ({ text: '', options: ['', '', '', ''], answer: 1, explanation: '', pattern: 'choice', image: '', matchingPairs: [{ left: '', right: '' }] })
const emptyNews = (): AdminNews => ({ title: '', content: '', icon: '📢', type: 'NEWS', date: new Date().toLocaleDateString('th-TH'), isActive: true })

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
  const [analysis, setAnalysis] = useState('')

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
      if (!result.success || !result.isValid) { setLoginError('รหัสผ่านไม่ถูกต้อง'); return }
      setAuthenticated(true); setTab('lessons'); await loadLessons()
    } catch { setLoginError('เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ') }
    finally { setBusy(false) }
  }

  const changeTab = async (next: Tab) => {
    setTab(next); setStatus('')
    if (next === 'lessons' || next === 'reports') await loadLessons()
    if (next === 'students') { const result = await run(() => service.loadStudents(password)); if (result?.data) setStudents(result.data as AdminStudent[]) }
    if (next === 'settings') { const result = await run(() => service.loadSettings()); if (result?.data) setSettings(result.data as Record<string, unknown>) }
    if (next === 'news') { const result = await run(() => service.loadNews(password)); if (result?.data) setNews(result.data as AdminNews[]) }
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
  const studentAction = async (kind: 'reset' | 'delete', student: AdminStudent) => {
    if (!confirmAction(`${kind === 'reset' ? 'รีเซ็ต' : 'ลบ'}ข้อมูล ${student.name}?`)) return
    const task = kind === 'reset' ? service.resetStudent(student.id, password) : service.deleteStudent(student.id, password)
    const result = await run(() => task, 'อัปเดตข้อมูลนักเรียนแล้ว')
    if (result) { const refreshed = await service.loadStudents(password); if (refreshed.data) setStudents(refreshed.data) }
  }
  const analyzeStudent = async (student: AdminStudent) => {
    const result = await run(() => service.generateProgressReport(student))
    if (result) setAnalysis(result.answer || 'ไม่มีข้อมูลสำหรับวิเคราะห์')
  }
  const resetAll = async () => {
    if (!confirmAction(`รีเซ็ตนักเรียน${classFilter ? `ในชั้น ${classFilter}` : 'ทั้งหมด'}?`)) return
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
    <nav className="mb-5 flex flex-wrap gap-2">{([['lessons', 'บทเรียน'], ['students', 'นักเรียน'], ['reports', 'รายงาน'], ['settings', 'ตั้งค่า'], ['news', 'ประกาศ']] as Array<[Tab, string]>).map(([id, label]) => <button type="button" key={id} onClick={() => void changeTab(id)} className={`${tab === id ? primary : secondary}`}>{label}</button>)}</nav>
    {status && <p role="status" className={`mb-4 rounded-xl p-3 font-bold ${status.includes('แล้ว') ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{status}</p>}
    {busy && <p className="mb-4 text-indigo-700">กำลังดำเนินการ...</p>}

    {tab === 'lessons' && <div className="rounded-3xl bg-white/90 p-5 shadow-xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-2xl font-black text-slate-800">บทเรียน</h2><button className={primary} onClick={() => setLessonDraft(emptyLesson())}>เพิ่มบทเรียน</button></div>
      <div className="grid gap-3">{lessons.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"><div className="flex items-center gap-3"><span className="text-3xl">{item.icon}</span><div><h3 className="font-black">{item.title}</h3><p className="text-sm text-slate-500">{item.id} · {item.questionCount || 0} ข้อ · {item.isActive === false ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</p></div></div><div className="flex flex-wrap gap-2"><button className={secondary} onClick={() => void openQuestions(item)} aria-label={`จัดการข้อสอบ ${item.title}`}>ข้อสอบ</button><button className={secondary} onClick={() => setLessonDraft({ ...item })} aria-label={`แก้ไข ${item.title}`}>แก้ไข</button><button className="rounded-xl bg-red-100 px-3 py-2 font-bold text-red-700" onClick={() => void deleteLesson(item)} aria-label={`ลบ ${item.title}`}>ลบ</button></div></article>)}</div>
    </div>}

    {tab === 'students' && <div className="rounded-3xl bg-white/90 p-5 shadow-xl"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-black">นักเรียน</h2><div className="flex gap-2"><select aria-label="กรองชั้นเรียน" className={fieldClass} value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="">ทุกชั้น</option>{classes.map((item) => <option key={item}>{item}</option>)}</select><button className="rounded-xl bg-red-600 px-3 py-2 font-bold text-white" onClick={() => void resetAll()}>รีเซ็ตทั้งหมด</button></div></div>
      <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b"><th className="p-2">นักเรียน</th><th>ชั้น</th><th>XP / Rank</th><th>บทเรียนปัจจุบัน</th><th>จัดการ</th></tr></thead><tbody>{filteredStudents.map((item) => <tr key={item.id} className="border-b"><td className="p-2 font-bold">{item.avatar} {item.name}</td><td>{item.class}</td><td>{item.xp || 0} / {item.rank || '-'}</td><td>{item.currentLesson || '-'}</td><td className="flex flex-wrap gap-1 py-2"><button className={secondary} onClick={() => void analyzeStudent(item)} aria-label={`วิเคราะห์ ${item.name}`}>วิเคราะห์</button><button className={secondary} onClick={() => void studentAction('reset', item)} aria-label={`รีเซ็ต ${item.name}`}>รีเซ็ต</button><button className="rounded-lg bg-red-100 px-2 text-red-700" onClick={() => void studentAction('delete', item)} aria-label={`ลบ ${item.name}`}>ลบ</button></td></tr>)}</tbody></table></div>
    </div>}

    {tab === 'settings' && <form onSubmit={savePublicSettings} className="mx-auto max-w-3xl rounded-3xl bg-white/90 p-6 shadow-xl"><h2 className="mb-4 text-2xl font-black">การตั้งค่าสาธารณะ</h2><div className="grid gap-4 md:grid-cols-2">
      <label className="font-bold">เวลาต่อข้อ (วินาที)<input aria-label="เวลาต่อข้อ (วินาที)" type="number" min="5" max="300" className={fieldClass} value={Number(settings.TimerPerQuestion) || 30} onChange={(event) => setSettings({ ...settings, TimerPerQuestion: Number(event.target.value) })} /></label>
      <label className="font-bold">ชั้นเรียน (คั่นด้วยจุลภาค)<input className={fieldClass} value={String(settings.Classes || '')} onChange={(event) => setSettings({ ...settings, Classes: event.target.value })} /></label>
      <label className="font-bold">ห้องเรียน (คั่นด้วยจุลภาค)<input className={fieldClass} value={String(settings.Rooms || '')} onChange={(event) => setSettings({ ...settings, Rooms: event.target.value })} /></label>
      <label className="font-bold">หัวใบประกาศ<input className={fieldClass} value={String(settings.CertHeader || '')} onChange={(event) => setSettings({ ...settings, CertHeader: event.target.value })} /></label>
      <label className="font-bold md:col-span-2">ท้ายใบประกาศ<input className={fieldClass} value={String(settings.CertFooter || '')} onChange={(event) => setSettings({ ...settings, CertFooter: event.target.value })} /></label>
    </div><p className="my-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">ข้อมูลลับและบริการสร้างเนื้อหา AI ถูกปิดในเว็บ client เพื่อความปลอดภัย</p><button className={primary}>บันทึกการตั้งค่า</button></form>}

    {tab === 'news' && <div className="rounded-3xl bg-white/90 p-5 shadow-xl"><div className="mb-4 flex justify-between"><h2 className="text-2xl font-black">ประกาศ</h2><button className={primary} onClick={() => setNewsDraft(emptyNews())}>เพิ่มประกาศ</button></div>{news.map((item) => <article key={item.id} className="mb-3 flex items-start justify-between gap-3 rounded-2xl border p-4"><div><h3 className="font-black">{item.icon} {item.title}</h3><p>{item.content}</p><small>{item.type} · {item.date} · {item.isActive === false ? 'ปิด' : 'เผยแพร่'}</small></div><div className="flex gap-2"><button className={secondary} onClick={() => setNewsDraft({ ...item })}>แก้ไข</button><button className="text-red-600" onClick={() => void deleteNews(item)} aria-label={`ลบประกาศ ${item.title}`}>ลบ</button></div></article>)}</div>}

    {tab === 'reports' && <div className="rounded-3xl bg-white/90 p-5 shadow-xl"><div className="mb-4 flex flex-wrap items-end gap-3"><label className="font-bold">เลือกบทเรียนสำหรับรายงาน<select aria-label="เลือกบทเรียนสำหรับรายงาน" className={fieldClass} value={reportLesson} onChange={(event) => void loadReports(event.target.value)}><option value="">เลือกบทเรียน</option>{lessons.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>{reports.length > 0 && <button className={secondary} onClick={() => downloadCsv(reportsToCsv(reports))}>ดาวน์โหลด CSV</button>}</div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3"><b className="rounded-xl bg-indigo-50 p-3">ผู้เข้าสอบ {summary.count}</b><b className="rounded-xl bg-emerald-50 p-3">คะแนนเฉลี่ย {summary.average}</b><b className="rounded-xl bg-amber-50 p-3">คะแนนสูงสุด {summary.highest}</b></div>
      <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>วันที่</th><th>ชื่อ</th><th>ชั้น</th><th>คะแนน</th><th>สถานะ</th></tr></thead><tbody>{reports.map((item, index) => <tr key={`${item.name}-${index}`} className="border-t"><td>{item.timestamp}</td><td>{item.name}</td><td>{item.class}</td><td>{item.score}/{item.totalQuestions}</td><td>{item.status}</td></tr>)}</tbody></table></div>
    </div>}

    {lessonDraft && <Modal label="จัดการบทเรียน" onClose={() => setLessonDraft(null)}><form onSubmit={saveLesson} className="grid gap-3 md:grid-cols-2">
      <label className="font-bold md:col-span-2">ชื่อบทเรียน<input aria-label="ชื่อบทเรียน" className={fieldClass} value={lessonDraft.title} onChange={(event) => setLessonDraft({ ...lessonDraft, title: event.target.value })} required /></label>
      <label>ไอคอน<input className={fieldClass} value={lessonDraft.icon || ''} onChange={(event) => setLessonDraft({ ...lessonDraft, icon: event.target.value })} /></label><label>URL วิดีโอ<input className={fieldClass} value={lessonDraft.videoUrl || ''} onChange={(event) => setLessonDraft({ ...lessonDraft, videoUrl: event.target.value })} /></label>
      <label className="md:col-span-2">คำอธิบาย<textarea className={fieldClass} value={lessonDraft.description || ''} onChange={(event) => setLessonDraft({ ...lessonDraft, description: event.target.value })} /></label><label className="md:col-span-2">เนื้อหา<textarea rows={6} className={fieldClass} value={lessonDraft.content || ''} onChange={(event) => setLessonDraft({ ...lessonDraft, content: event.target.value })} /></label><label className="md:col-span-2">URL ใบงาน<input className={fieldClass} value={lessonDraft.worksheetUrl || ''} onChange={(event) => setLessonDraft({ ...lessonDraft, worksheetUrl: event.target.value })} /></label>
      <label><input type="checkbox" checked={lessonDraft.isActive !== false} onChange={(event) => setLessonDraft({ ...lessonDraft, isActive: event.target.checked })} /> เปิดใช้งาน</label><label><input type="checkbox" checked={lessonDraft.enablePretest === true} onChange={(event) => setLessonDraft({ ...lessonDraft, enablePretest: event.target.checked })} /> มี Pretest</label>
      <div className="md:col-span-2 flex gap-2"><button className={primary}>บันทึกบทเรียน</button><button type="button" className={secondary} onClick={() => setLessonDraft(null)}>ยกเลิก</button></div>
    </form></Modal>}

    {questionLesson && <Modal label={`จัดการข้อสอบ: ${questionLesson.title}`} onClose={() => setQuestionLesson(null)}><div className="mb-4 flex flex-wrap gap-2"><select aria-label="ประเภทข้อสอบ" className={fieldClass} value={questionType} onChange={(event) => void reloadQuestions(event.target.value)}><option value="posttest">Posttest</option><option value="pretest">Pretest</option></select><button className={secondary} onClick={() => setQuestions((all) => [...all, emptyQuestion()])}>เพิ่มข้อ</button></div>
      <p className="mb-4 rounded-xl bg-blue-50 p-3 text-blue-700">การสร้างข้อสอบด้วย AI ถูกปิด เพราะเว็บ client ไม่สามารถเก็บ API key อย่างปลอดภัยได้</p>
      {questions.map((question, index) => <div key={index} className="mb-4 rounded-2xl border p-4"><div className="mb-2 flex justify-between"><b>ข้อ {index + 1}</b>{questions.length > 1 && <button className="text-red-600" onClick={() => setQuestions((all) => all.filter((_, at) => at !== index))}>ลบข้อ</button>}</div>
        <label>คำถาม<input aria-label={`คำถามข้อ ${index + 1}`} className={fieldClass} value={question.text} onChange={(event) => updateQuestion(index, { text: event.target.value })} /></label><label>รูปแบบ<select aria-label={`รูปแบบข้อ ${index + 1}`} className={fieldClass} value={question.pattern} onChange={(event) => updateQuestion(index, { pattern: event.target.value as AdminQuestion['pattern'] })}><option value="choice">ตัวเลือก</option><option value="matching">จับคู่</option></select></label>
        {question.pattern === 'choice' ? <div className="grid gap-2 md:grid-cols-2">{question.options.map((option, optionIndex) => <label key={optionIndex}>ตัวเลือก {optionIndex + 1}<input aria-label={`ตัวเลือก ${optionIndex + 1} ข้อ ${index + 1}`} className={fieldClass} value={option} onChange={(event) => updateQuestion(index, { options: question.options.map((item, at) => at === optionIndex ? event.target.value : item) })} /></label>)}<label>คำตอบที่ถูก<select className={fieldClass} value={Number(question.answer) || 1} onChange={(event) => updateQuestion(index, { answer: Number(event.target.value) })}>{[1, 2, 3, 4].map((value) => <option key={value}>{value}</option>)}</select></label></div> : <div>{question.matchingPairs.map((pair, pairIndex) => <div className="grid grid-cols-2 gap-2" key={pairIndex}><input aria-label={`ด้านซ้ายคู่ ${pairIndex + 1} ข้อ ${index + 1}`} className={fieldClass} value={pair.left} onChange={(event) => updateQuestion(index, { matchingPairs: question.matchingPairs.map((item, at) => at === pairIndex ? { ...item, left: event.target.value } : item) })} /><input aria-label={`ด้านขวาคู่ ${pairIndex + 1} ข้อ ${index + 1}`} className={fieldClass} value={pair.right} onChange={(event) => updateQuestion(index, { matchingPairs: question.matchingPairs.map((item, at) => at === pairIndex ? { ...item, right: event.target.value } : item) })} /></div>)}<button className={secondary} onClick={() => updateQuestion(index, { matchingPairs: [...question.matchingPairs, { left: '', right: '' }] })}>เพิ่มคู่</button></div>}
        <label>คำอธิบาย<textarea className={fieldClass} value={question.explanation} onChange={(event) => updateQuestion(index, { explanation: event.target.value })} /></label><label>URL รูปภาพ<input className={fieldClass} value={question.image} onChange={(event) => updateQuestion(index, { image: event.target.value })} /></label>
      </div>)}<div className="flex gap-2"><button className={primary} onClick={() => void saveQuestions()}>บันทึกข้อสอบ</button><button className={secondary} onClick={() => setQuestionLesson(null)}>ยกเลิก</button></div>
    </Modal>}

    {newsDraft && <Modal label="จัดการประกาศ" onClose={() => setNewsDraft(null)}><form onSubmit={saveNews} className="grid gap-3"><label>หัวข้อประกาศ<input aria-label="หัวข้อประกาศ" className={fieldClass} value={newsDraft.title} onChange={(event) => setNewsDraft({ ...newsDraft, title: event.target.value })} /></label><label>เนื้อหาประกาศ<textarea aria-label="เนื้อหาประกาศ" className={fieldClass} value={newsDraft.content} onChange={(event) => setNewsDraft({ ...newsDraft, content: event.target.value })} /></label><div className="grid grid-cols-2 gap-3"><label>ไอคอน<input className={fieldClass} value={newsDraft.icon || ''} onChange={(event) => setNewsDraft({ ...newsDraft, icon: event.target.value })} /></label><label>ประเภท<input className={fieldClass} value={newsDraft.type || ''} onChange={(event) => setNewsDraft({ ...newsDraft, type: event.target.value })} /></label></div><label><input type="checkbox" checked={newsDraft.isActive !== false} onChange={(event) => setNewsDraft({ ...newsDraft, isActive: event.target.checked })} /> เผยแพร่</label><button className={primary}>บันทึกประกาศ</button></form></Modal>}
    {analysis && <Modal label="รายงานวิเคราะห์นักเรียน" onClose={() => setAnalysis('')}><pre className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-sans">{analysis}</pre><button className={`${primary} mt-4`} onClick={() => setAnalysis('')}>ปิดรายงาน</button></Modal>}
  </section>
}

function defaultDownload(csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'exam-report.csv'; anchor.click(); URL.revokeObjectURL(url)
}
