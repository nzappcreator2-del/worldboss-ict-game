// Pure quest engine for the ครูวีรภัทร์ NPC feature: quest assignments live in
// the admin-managed `teacherQuests` collection, while every per-student fact is
// derived from systems that already exist (progress docs, inventory.worksheets,
// inventory.teacherQuests acceptance stamps).
//
// Each quest carries its own admin-configured turn-in reward (XP, coins,
// consumables, wardrobe unlocks, a badge, plus an early-submission bonus). That
// payout is separate from — and on top of — the one-time worksheet study reward
// the worksheet flow already pays; the two never overlap because they fire on
// different actions (first worksheet submit vs. handing the quest to the NPC).

import { COSMETIC_CATALOG } from './gameLogic'
import { levelForXp } from './levelSystem'
import { rankForXp } from './normalizers'

export type TeacherQuestObjective = 'study' | 'posttest' | 'worksheet'
export type TeacherQuestStatus = 'draft' | 'active' | 'closed' | 'archived'
export type StudentQuestStatus = 'AVAILABLE' | 'IN_PROGRESS' | 'READY_TO_TURN_IN' | 'COMPLETED' | 'OVERDUE'

// Reward channels an admin can attach to a quest. `bonusXp`/`bonusCoins` are
// only paid when the student turns the quest in on or before its due date.
export type TeacherQuestRewards = {
  xp: number
  coins: number
  bonusXp: number
  bonusCoins: number
  items: Record<string, number>
  cosmeticIds: string[]
  badge: string
}

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
  rewards: TeacherQuestRewards
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
  // The quest's own turn-in payout, plus what it would actually be worth if the
  // student handed it in today (early bonus included while still in time).
  hasRewards: boolean
  earnable: EarnedQuestRewards
  // The separate one-time worksheet study reward, shown for context only.
  worksheetReward: { xp: number; coins: number } | null
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

// --- Quest rewards ----------------------------------------------------------
// Firestore rules cap every single user write at ±1000 XP and ±1000 coins, so
// base + bonus must stay inside that ceiling or the payout would be rejected
// mid-flight. Validation happens in the admin form; normalization clamps as a
// second line of defence for documents written before the cap existed.
export const REWARD_XP_MAX = 1000
export const REWARD_COINS_MAX = 1000
export const REWARD_ITEM_MAX_QTY = 20
export const REWARD_BADGE_MAX_LENGTH = 40

// Consumables the quest can grant, keyed by the same bag ids the shop uses.
export const REWARD_ITEM_CATALOG: Record<string, string> = {
  potion: 'ยาเพิ่มพลัง',
  magnifier: 'แว่นขยายช่วยตอบ',
}

export const EMPTY_QUEST_REWARDS: TeacherQuestRewards = {
  xp: 0, coins: 0, bonusXp: 0, bonusCoins: 0, items: {}, cosmeticIds: [], badge: '',
}

const clampInt = (value: unknown, max: number) => {
  const number = Math.floor(Number(value))
  if (!Number.isFinite(number) || number <= 0) return 0
  return Math.min(number, max)
}

export function normalizeQuestRewards(raw: unknown): TeacherQuestRewards {
  if (!raw || typeof raw !== 'object') return EMPTY_QUEST_REWARDS
  const data = raw as Record<string, unknown>
  const rawItems = data.items && typeof data.items === 'object' ? data.items as Record<string, unknown> : {}
  const items: Record<string, number> = {}
  for (const itemId of Object.keys(REWARD_ITEM_CATALOG)) {
    const quantity = clampInt(rawItems[itemId], REWARD_ITEM_MAX_QTY)
    if (quantity > 0) items[itemId] = quantity
  }
  const rawCosmetics = Array.isArray(data.cosmeticIds) ? data.cosmeticIds.map(String) : []
  return {
    xp: clampInt(data.xp, REWARD_XP_MAX),
    coins: clampInt(data.coins, REWARD_COINS_MAX),
    bonusXp: clampInt(data.bonusXp, REWARD_XP_MAX),
    bonusCoins: clampInt(data.bonusCoins, REWARD_COINS_MAX),
    items,
    cosmeticIds: [...new Set(rawCosmetics.filter((id) => id in COSMETIC_CATALOG))],
    badge: String(data.badge || '').trim().slice(0, REWARD_BADGE_MAX_LENGTH),
  }
}

export function hasQuestRewards(rewards: TeacherQuestRewards): boolean {
  return rewards.xp > 0 || rewards.coins > 0 || rewards.bonusXp > 0 || rewards.bonusCoins > 0
    || Object.keys(rewards.items).length > 0 || rewards.cosmeticIds.length > 0 || rewards.badge !== ''
}

export function validateQuestRewards(rewards: TeacherQuestRewards): { valid: boolean; error?: string } {
  if (rewards.xp + rewards.bonusXp > REWARD_XP_MAX) {
    return { valid: false, error: `XP รวมโบนัสต้องไม่เกิน ${REWARD_XP_MAX} ต่อการส่งงาน 1 ครั้ง` }
  }
  if (rewards.coins + rewards.bonusCoins > REWARD_COINS_MAX) {
    return { valid: false, error: `เหรียญรวมโบนัสต้องไม่เกิน ${REWARD_COINS_MAX} ต่อการส่งงาน 1 ครั้ง` }
  }
  return { valid: true }
}

export type EarnedQuestRewards = Omit<TeacherQuestRewards, 'bonusXp' | 'bonusCoins'> & {
  earlyBonusApplied: boolean
}

// `dueAt` and `turnInDay` are Asia/Bangkok YYYY-MM-DD strings, so a plain string
// comparison is a correct date comparison. A quest with no due date always pays
// its bonus — there is nothing to be late for.
export function earnedQuestRewards(
  rewards: TeacherQuestRewards,
  dueAt: string,
  turnInDay: string,
): EarnedQuestRewards {
  const earlyBonusApplied = !dueAt || turnInDay <= dueAt
  return {
    xp: rewards.xp + (earlyBonusApplied ? rewards.bonusXp : 0),
    coins: rewards.coins + (earlyBonusApplied ? rewards.bonusCoins : 0),
    items: rewards.items,
    cosmeticIds: rewards.cosmeticIds,
    badge: rewards.badge,
    earlyBonusApplied,
  }
}

export type QuestRewardTarget = { xp?: unknown; coins?: unknown; inventory?: unknown }
export type GrantedQuestRewards = {
  xp: number
  coins: number
  level: number
  rank: string
  inventory: Record<string, unknown>
}

// Pure payout: folds an earned reward set into a user document's totals and
// bag. Every channel is additive and idempotent in shape — cosmetics are only
// added to `owned` (never auto-equipped, so a surprise unlock can't change the
// look the student chose), badges de-duplicate, and consumables stack.
export function grantQuestRewards(user: QuestRewardTarget, earned: EarnedQuestRewards): GrantedQuestRewards {
  const inventory = user.inventory && typeof user.inventory === 'object'
    ? { ...(user.inventory as Record<string, unknown>) }
    : {}

  for (const [itemId, quantity] of Object.entries(earned.items)) {
    inventory[itemId] = (Number(inventory[itemId]) || 0) + quantity
  }

  if (earned.cosmeticIds.length > 0) {
    const raw = inventory.cosmetics && typeof inventory.cosmetics === 'object'
      ? inventory.cosmetics as Record<string, unknown>
      : {}
    const owned = Array.isArray(raw.owned) ? raw.owned.map(String) : []
    const equipped = raw.equipped && typeof raw.equipped === 'object' ? raw.equipped : {}
    inventory.cosmetics = { owned: [...new Set([...owned, ...earned.cosmeticIds])], equipped }
  }

  if (earned.badge) {
    const badges = Array.isArray(inventory.badges) ? inventory.badges.map(String) : []
    inventory.badges = badges.includes(earned.badge) ? badges : [...badges, earned.badge]
  }

  const xp = Math.max(0, Number(user.xp) || 0) + earned.xp
  const coins = Math.max(0, Number(user.coins) || 0) + earned.coins
  return { xp, coins, level: levelForXp(xp), rank: rankForXp(xp), inventory }
}

export function describeQuestRewards(rewards: TeacherQuestRewards | EarnedQuestRewards): string[] {
  const lines: string[] = []
  if (rewards.xp > 0) lines.push(`⭐ ${rewards.xp} XP`)
  if (rewards.coins > 0) lines.push(`🪙 ${rewards.coins} เหรียญ`)
  for (const [itemId, quantity] of Object.entries(rewards.items)) {
    lines.push(`🎁 ${REWARD_ITEM_CATALOG[itemId] || itemId} ×${quantity}`)
  }
  for (const cosmeticId of rewards.cosmeticIds) {
    lines.push(`👕 ${COSMETIC_CATALOG[cosmeticId]?.name || cosmeticId}`)
  }
  if (rewards.badge) lines.push(`🏅 ${rewards.badge}`)
  return lines
}

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
    rewards: normalizeQuestRewards(data.rewards),
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
    hasRewards: hasQuestRewards(quest.rewards),
    // Previewed against today, so the student can see the early bonus they are
    // still in time for (or that they have already missed).
    earnable: earnedQuestRewards(quest.rewards, quest.dueAt, today),
    worksheetReward: quest.objectives.includes('worksheet')
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

// Lessons that deserve a "!" quest marker on the adventure map: accepted but
// still unfinished. READY_TO_TURN_IN is deliberately excluded — that student
// should walk back to the NPC, not into the lesson again.
export function questTargetLessonIds(views: StudentQuestView[]): string[] {
  return [...new Set(views
    .filter((view) => view.studentStatus === 'IN_PROGRESS' || (view.studentStatus === 'OVERDUE' && view.accepted))
    .map((view) => view.lessonId)
    .filter(Boolean))]
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
  const rewards = validateQuestRewards(draft.rewards)
  if (!rewards.valid) return rewards
  // An early-submission bonus with no deadline would always pay out, which is
  // never what the teacher meant when they typed it.
  if (!draft.dueAt && (draft.rewards.bonusXp > 0 || draft.rewards.bonusCoins > 0)) {
    return { valid: false, error: 'โบนัสส่งก่อนกำหนดต้องระบุวันกำหนดส่งด้วย' }
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
