// Pure quest engine for the ครูวีรภัทร์ NPC feature: quest assignments live in
// the admin-managed `teacherQuests` collection, while every per-student fact is
// derived from systems that already exist (progress docs, inventory.worksheets,
// inventory.teacherQuests acceptance stamps). Nothing here pays rewards — the
// worksheet/lesson flows keep doing that exactly once, and the NPC only
// presents the outcome.

export type TeacherQuestObjective = 'study' | 'posttest' | 'worksheet'
export type TeacherQuestStatus = 'draft' | 'active' | 'closed' | 'archived'
export type StudentQuestStatus = 'AVAILABLE' | 'IN_PROGRESS' | 'READY_TO_TURN_IN' | 'COMPLETED' | 'OVERDUE'

export type TeacherQuest = {
  questId: string
  lessonId: string
  lessonTitle: string
  title: string
  npcMessage: string
  objectives: TeacherQuestObjective[]
  classes: string[]
  startAt: string
  dueAt: string
  status: TeacherQuestStatus
}

// Acceptance stamps saved under users/{id}.inventory.teacherQuests[questId].
export type TeacherQuestState = {
  acceptedAt?: string
  studiedAt?: string
  turnedInAt?: string
}

export type StudentQuestContext = {
  state?: TeacherQuestState
  lessonPassed: boolean
  worksheetSubmitted: boolean
}

export type StudentQuestView = Omit<TeacherQuest, 'objectives'> & {
  studentStatus: StudentQuestStatus
  objectives: Array<{ key: TeacherQuestObjective; label: string; done: boolean }>
  rewards: { xp: number; coins: number } | null
  accepted: boolean
}

export const TEACHER_NPC_NAME = 'ครูวีรภัทร์'
export const TEACHER_NPC_ROLE = 'ผู้มอบหมายภารกิจ'

// Mirrors the one-time study reward paid by saveWorksheetSubmission — display
// only; the payout itself stays in that flow.
export const WORKSHEET_FIRST_SUBMIT_XP = 40
export const WORKSHEET_FIRST_SUBMIT_COINS = 25

export const OBJECTIVE_LABELS: Record<TeacherQuestObjective, string> = {
  study: 'ศึกษาบทเรียน',
  posttest: 'เอาชนะบอสท้ายบทเรียน',
  worksheet: 'ทำใบงานส่งครู',
}

export const STUDENT_STATUS_LABELS: Record<StudentQuestStatus, string> = {
  AVAILABLE: 'ภารกิจใหม่',
  IN_PROGRESS: 'กำลังดำเนินการ',
  READY_TO_TURN_IN: 'พร้อมส่ง',
  COMPLETED: 'สำเร็จแล้ว',
  OVERDUE: 'เลยกำหนด',
}

export const QUEST_STATUS_LABELS: Record<TeacherQuestStatus, string> = {
  draft: 'แบบร่าง',
  active: 'เปิดใช้งาน',
  closed: 'ปิดรับงาน',
  archived: 'เก็บถาวร',
}

export const NPC_MESSAGE_TEMPLATES = [
  'สวัสดีนักผจญภัย วันนี้ครูมีภารกิจใหม่ให้เธอ ลองศึกษาบทเรียนและทำใบงานนี้ให้สำเร็จนะ',
  'ศึกษาบทเรียนให้เข้าใจ แล้วทำใบงานให้เรียบร้อยก่อนกลับมาส่งครูนะ',
  'ภารกิจนี้สำคัญมาก ตั้งใจศึกษาบทเรียนแล้วกลับมารายงานผลกับครูด้วยนะ',
]

export const NPC_SMALL_TALK = [
  'มีภารกิจใหม่รออยู่นะ',
  'อย่าลืมกลับมาส่งงานกับครู',
  'ความพยายามทำให้เราเก่งขึ้น',
  'ติดตรงไหน กลับไปทบทวนบทเรียนได้นะ',
  'ทำได้ดีมาก เหลืออีกนิดเดียว!',
]

const OBJECTIVE_KEYS: TeacherQuestObjective[] = ['study', 'posttest', 'worksheet']
const QUEST_STATUSES: TeacherQuestStatus[] = ['draft', 'active', 'closed', 'archived']

export function normalizeTeacherQuest(id: string, data: Record<string, unknown>): TeacherQuest {
  const rawObjectives = Array.isArray(data.objectives) ? data.objectives.map(String) : []
  const rawStatus = String(data.status || 'active') as TeacherQuestStatus
  return {
    questId: String(data.questId || id),
    lessonId: String(data.lessonId || ''),
    lessonTitle: String(data.lessonTitle || ''),
    title: String(data.title || ''),
    npcMessage: String(data.npcMessage || ''),
    objectives: OBJECTIVE_KEYS.filter((key) => rawObjectives.includes(key)),
    classes: Array.isArray(data.classes) ? data.classes.map(String).filter(Boolean) : [],
    startAt: String(data.startAt || ''),
    dueAt: String(data.dueAt || ''),
    status: QUEST_STATUSES.includes(rawStatus) ? rawStatus : 'active',
  }
}

// Class targeting matches by grade: the admin form offers grade levels
// ("ป.1"), while student records carry the room too ("ป.1/1", "ป.1/2").
// A target therefore matches its exact value OR any room under it — with the
// "/" boundary so "ป.1" can never leak into "ป.10". Room-specific targets
// ("ป.6/3") keep matching only that room.
export function questTargetsClass(quest: TeacherQuest, className: string): boolean {
  if (quest.classes.length === 0) return true
  const studentClass = className.trim()
  return quest.classes.some((rawTarget) => {
    const target = rawTarget.trim()
    return studentClass === target || studentClass.startsWith(`${target}/`)
  })
}

// `today` is the Asia/Bangkok YYYY-MM-DD day string, so plain string
// comparison is a correct date comparison.
export function questVisibleToStudent(quest: TeacherQuest, className: string, today: string, hasState: boolean): boolean {
  if (!questTargetsClass(quest, className)) return false
  if (quest.status === 'active') return !quest.startAt || quest.startAt <= today
  // A closed quest stays visible to students who already engaged with it so
  // their status/answers never silently disappear.
  if (quest.status === 'closed') return hasState
  return false
}

function objectiveDone(key: TeacherQuestObjective, context: StudentQuestContext): boolean {
  if (key === 'worksheet') return context.worksheetSubmitted
  if (key === 'posttest') return context.lessonPassed
  // Studying is satisfied by opening the lesson through the quest flow, or
  // implicitly by having beaten the lesson / submitted its worksheet already.
  return Boolean(context.state?.studiedAt) || context.lessonPassed || context.worksheetSubmitted
}

function allObjectivesDone(quest: TeacherQuest, context: StudentQuestContext): boolean {
  return quest.objectives.length > 0 && quest.objectives.every((key) => objectiveDone(key, context))
}

export function studentQuestStatus(quest: TeacherQuest, context: StudentQuestContext, today: string): StudentQuestStatus {
  if (context.state?.turnedInAt) return 'COMPLETED'
  const done = allObjectivesDone(quest, context)
  if (context.state?.acceptedAt && done) return 'READY_TO_TURN_IN'
  if (quest.dueAt && today > quest.dueAt) return 'OVERDUE'
  if (!context.state?.acceptedAt) return 'AVAILABLE'
  return 'IN_PROGRESS'
}

export function buildStudentQuestView(quest: TeacherQuest, context: StudentQuestContext, today: string): StudentQuestView {
  return {
    ...quest,
    studentStatus: studentQuestStatus(quest, context, today),
    objectives: quest.objectives.map((key) => ({ key, label: OBJECTIVE_LABELS[key], done: objectiveDone(key, context) })),
    rewards: quest.objectives.includes('worksheet')
      ? { xp: WORKSHEET_FIRST_SUBMIT_XP, coins: WORKSHEET_FIRST_SUBMIT_COINS }
      : null,
    accepted: Boolean(context.state?.acceptedAt),
  }
}

export type NpcMarker = 'ready' | 'new' | 'working' | 'none'

export function npcMarkerForStatuses(statuses: StudentQuestStatus[]): NpcMarker {
  if (statuses.includes('READY_TO_TURN_IN')) return 'ready'
  if (statuses.includes('AVAILABLE')) return 'new'
  if (statuses.includes('IN_PROGRESS') || statuses.includes('OVERDUE')) return 'working'
  return 'none'
}

export type DialogueAction = 'accept' | 'continue' | 'detail' | 'review' | 'turnIn' | 'close'

export type QuestDialogue = {
  message: string
  buttons: Array<{ action: DialogueAction; label: string }>
}

export function dialogueForQuest(view: StudentQuestView): QuestDialogue {
  if (view.studentStatus === 'COMPLETED') {
    return {
      message: 'ทำได้ดีมาก ภารกิจนี้สำเร็จแล้ว ครูภูมิใจในความพยายามของเธอ!',
      buttons: [{ action: 'close', label: 'ปิด' }],
    }
  }
  if (view.studentStatus === 'READY_TO_TURN_IN') {
    if (view.status === 'closed') {
      return {
        message: 'ภารกิจนี้ปิดรับงานแล้ว แต่ครูเห็นความตั้งใจของเธอนะ ผลงานที่ทำไว้ยังอยู่ครบ',
        buttons: [{ action: 'detail', label: 'ดูรายละเอียด' }, { action: 'close', label: 'ปิด' }],
      }
    }
    return {
      message: 'ยอดเยี่ยมมาก ครูเห็นว่าเธอทำภารกิจเรียบร้อยแล้ว พร้อมส่งงานหรือยัง?',
      buttons: [
        { action: 'turnIn', label: 'ส่งงาน' },
        { action: 'review', label: 'ตรวจคำตอบอีกครั้ง' },
        { action: 'close', label: 'ปิด' },
      ],
    }
  }
  if (view.studentStatus === 'AVAILABLE') {
    return {
      message: view.npcMessage || NPC_MESSAGE_TEMPLATES[0],
      buttons: [
        { action: 'accept', label: 'รับภารกิจ' },
        { action: 'detail', label: 'ดูรายละเอียด' },
        { action: 'close', label: 'ไว้ก่อน' },
      ],
    }
  }
  const overdueNote = view.studentStatus === 'OVERDUE' ? ' ตอนนี้เลยกำหนดส่งแล้ว รีบทำให้เสร็จนะ' : ''
  return {
    message: `ภารกิจเป็นอย่างไรบ้าง หากไม่แน่ใจสามารถกลับไปดูบทเรียนได้เสมอนะ${overdueNote}`,
    buttons: [
      { action: 'continue', label: 'ทำภารกิจต่อ' },
      { action: 'detail', label: 'ดูรายละเอียดงาน' },
      { action: 'close', label: 'ปิด' },
    ],
  }
}

// The single quest surfaced in the compact tracker: turn-in beats overdue
// beats plain progress; unaccepted quests stay off the tracker.
export function trackedQuest(views: StudentQuestView[]): StudentQuestView | null {
  return views.find((view) => view.studentStatus === 'READY_TO_TURN_IN')
    || views.find((view) => view.studentStatus === 'OVERDUE' && view.accepted)
    || views.find((view) => view.studentStatus === 'IN_PROGRESS')
    || null
}

export function trackerHint(view: StudentQuestView): string {
  if (view.studentStatus === 'READY_TO_TURN_IN') return `กลับไปส่งงานกับ${TEACHER_NPC_NAME}`
  const next = view.objectives.find((objective) => !objective.done)
  const hint = next ? next.label : `กลับไปหา${TEACHER_NPC_NAME}`
  return view.studentStatus === 'OVERDUE' ? `${hint} (เลยกำหนดส่งแล้ว)` : hint
}

export function newQuestIdsToNotify(views: StudentQuestView[], seenIds: string[]): string[] {
  return views
    .filter((view) => view.studentStatus === 'AVAILABLE' && !seenIds.includes(view.questId))
    .map((view) => view.questId)
}

// --- Admin-side helpers ------------------------------------------------------

export type LessonCapabilities = {
  questionCount: number
  content: string
  worksheetUrl: string
}

export type ObjectiveOption = {
  key: TeacherQuestObjective
  label: string
  enabled: boolean
  reason?: string
}

export function availableObjectivesForLesson(lesson: LessonCapabilities): ObjectiveOption[] {
  const hasWorksheet = Boolean(lesson.content.trim() || lesson.worksheetUrl.trim())
  const hasQuestions = lesson.questionCount > 0
  return [
    { key: 'study', label: OBJECTIVE_LABELS.study, enabled: true },
    {
      key: 'posttest', label: OBJECTIVE_LABELS.posttest, enabled: hasQuestions,
      ...(hasQuestions ? {} : { reason: 'บทเรียนนี้ยังไม่มีข้อสอบท้ายบท' }),
    },
    {
      key: 'worksheet', label: OBJECTIVE_LABELS.worksheet, enabled: hasWorksheet,
      ...(hasWorksheet ? {} : { reason: 'บทเรียนนี้ยังไม่มีใบงานหรือเนื้อหาใบงาน' }),
    },
  ]
}

export function validateTeacherQuestDraft(
  draft: TeacherQuest,
  lesson: LessonCapabilities | null,
): { valid: boolean; error?: string } {
  if (!draft.lessonId || !lesson) return { valid: false, error: 'กรุณาเลือกบทเรียนก่อนบันทึกเควสต์' }
  if (!draft.title.trim()) return { valid: false, error: 'กรุณาระบุชื่อเควสต์' }
  if (draft.objectives.length === 0) return { valid: false, error: 'เลือกสิ่งที่นักเรียนต้องทำอย่างน้อย 1 ข้อ' }
  const options = availableObjectivesForLesson(lesson)
  for (const key of draft.objectives) {
    const option = options.find((item) => item.key === key)
    if (!option?.enabled) return { valid: false, error: option?.reason || 'บทเรียนนี้ไม่รองรับเป้าหมายที่เลือก' }
  }
  if (draft.startAt && draft.dueAt && draft.dueAt < draft.startAt) {
    return { valid: false, error: 'วันกำหนดส่งต้องไม่อยู่ก่อนวันเริ่มภารกิจ' }
  }
  return { valid: true }
}

export type TeacherQuestStats = {
  assigned: number
  notStarted: number
  inProgress: number
  ready: number
  completed: number
  overdue: number
}

export type StudentQuestSnapshot = StudentQuestContext & { class: string }

export function aggregateTeacherQuestStats(
  quest: TeacherQuest,
  students: StudentQuestSnapshot[],
  today: string,
): TeacherQuestStats {
  const stats: TeacherQuestStats = { assigned: 0, notStarted: 0, inProgress: 0, ready: 0, completed: 0, overdue: 0 }
  for (const snapshot of students) {
    if (!questTargetsClass(quest, snapshot.class)) continue
    stats.assigned += 1
    const status = studentQuestStatus(quest, snapshot, today)
    if (status === 'AVAILABLE') stats.notStarted += 1
    else if (status === 'IN_PROGRESS') stats.inProgress += 1
    else if (status === 'READY_TO_TURN_IN') stats.ready += 1
    else if (status === 'COMPLETED') stats.completed += 1
    else stats.overdue += 1
  }
  return stats
}

export function defaultQuestTitle(lessonTitle: string): string {
  return `ภารกิจ: ${lessonTitle}`
}
