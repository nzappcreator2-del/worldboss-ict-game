import { describe, expect, it } from 'vitest'
import {
  OBJECTIVE_LABELS,
  STUDENT_STATUS_LABELS,
  TEACHER_NPC_NAME,
  WORKSHEET_FIRST_SUBMIT_COINS,
  WORKSHEET_FIRST_SUBMIT_XP,
  aggregateTeacherQuestStats,
  availableObjectivesForLesson,
  buildStudentQuestView,
  defaultQuestTitle,
  describeQuestRewards,
  dialogueForQuest,
  earnedQuestRewards,
  grantQuestRewards,
  hasQuestRewards,
  newQuestIdsToNotify,
  normalizeQuestRewards,
  normalizeTeacherQuest,
  questTargetLessonIds,
  npcMarkerForStatuses,
  questTargetsClass,
  questVisibleToStudent,
  studentQuestStatus,
  trackedQuest,
  trackerHint,
  validateQuestRewards,
  validateTeacherQuestDraft,
  EMPTY_QUEST_REWARDS,
  REWARD_COINS_MAX,
  REWARD_ITEM_MAX_QTY,
  type StudentQuestContext,
  type TeacherQuest,
} from './teacherQuestLogic'
import { levelForXp } from './levelSystem'
import { rankForXp } from './normalizers'

const quest = (override: Partial<TeacherQuest> = {}): TeacherQuest => ({
  questId: 'TQ001',
  lessonId: 'L1',
  lessonTitle: 'ความปลอดภัยบนโลกออนไลน์',
  title: 'ภารกิจ: ความปลอดภัยบนโลกออนไลน์',
  npcMessage: 'ศึกษาบทเรียนแล้วทำใบงานให้เรียบร้อยก่อนกลับมาส่งครูนะ',
  objectives: ['study', 'worksheet'],
  classes: [],
  startAt: '',
  dueAt: '',
  status: 'active',
  rewards: EMPTY_QUEST_REWARDS,
  ...override,
})

const context = (override: Partial<StudentQuestContext> = {}): StudentQuestContext => ({
  state: undefined,
  lessonPassed: false,
  worksheetSubmitted: false,
  ...override,
})

const TODAY = '2026-07-19'

describe('normalizeTeacherQuest', () => {
  it('coerces a raw Firestore document into a typed quest with safe defaults', () => {
    const normalized = normalizeTeacherQuest('TQ009', {
      lessonId: 'L4',
      title: 'ภารกิจพิเศษ',
      objectives: ['worksheet', 'unknown-key', 'posttest'],
      classes: ['ป.5'],
      status: 'draft',
    })
    expect(normalized.questId).toBe('TQ009')
    expect(normalized.lessonId).toBe('L4')
    // Unknown keys drop out; kept keys land in canonical learning order.
    expect(normalized.objectives).toEqual(['posttest', 'worksheet'])
    expect(normalized.classes).toEqual(['ป.5'])
    expect(normalized.status).toBe('draft')
    expect(normalized.npcMessage).toBe('')
    expect(normalized.startAt).toBe('')
    expect(normalized.dueAt).toBe('')
  })

  it('falls back to an active status and empty targeting for malformed data', () => {
    const normalized = normalizeTeacherQuest('TQ010', { status: 'nonsense', classes: 'ป.4' })
    expect(normalized.status).toBe('active')
    expect(normalized.classes).toEqual([])
    expect(normalized.objectives).toEqual([])
  })
})

describe('questTargetsClass', () => {
  it('targets everyone when no classes are picked and only listed classes otherwise', () => {
    expect(questTargetsClass(quest(), 'ป.4')).toBe(true)
    expect(questTargetsClass(quest({ classes: ['ป.5', 'ป.6'] }), 'ป.5')).toBe(true)
    expect(questTargetsClass(quest({ classes: ['ป.5', 'ป.6'] }), 'ป.4')).toBe(false)
  })

  it('covers every room of a grade: target ป.1 reaches students registered as ป.1/1, ป.1/2', () => {
    expect(questTargetsClass(quest({ classes: ['ป.1'] }), 'ป.1/1')).toBe(true)
    expect(questTargetsClass(quest({ classes: ['ป.1'] }), 'ป.1/2')).toBe(true)
    expect(questTargetsClass(quest({ classes: ['ป.1'] }), 'ป.1')).toBe(true)
    expect(questTargetsClass(quest({ classes: ['ป.1'] }), 'ป.2/1')).toBe(false)
  })

  it('never lets a grade prefix leak into a longer grade (ป.1 must not match ม.1 or ป.10)', () => {
    expect(questTargetsClass(quest({ classes: ['ป.1'] }), 'ป.10')).toBe(false)
    expect(questTargetsClass(quest({ classes: ['ป.1'] }), 'ป.10/1')).toBe(false)
    expect(questTargetsClass(quest({ classes: ['ม.1'] }), 'ป.1/1')).toBe(false)
  })

  it('still honours a room-specific target exactly', () => {
    expect(questTargetsClass(quest({ classes: ['ป.6/3'] }), 'ป.6/3')).toBe(true)
    expect(questTargetsClass(quest({ classes: ['ป.6/3'] }), 'ป.6/1')).toBe(false)
  })

  it('ignores stray whitespace on either side of the comparison', () => {
    expect(questTargetsClass(quest({ classes: [' ป.1 '] }), 'ป.1/1')).toBe(true)
    expect(questTargetsClass(quest({ classes: ['ป.1'] }), ' ป.1/1 ')).toBe(true)
  })
})

describe('questVisibleToStudent', () => {
  it('shows active quests to targeted classes only after the start date', () => {
    expect(questVisibleToStudent(quest(), 'ป.5', TODAY, false)).toBe(true)
    expect(questVisibleToStudent(quest({ startAt: '2026-07-20' }), 'ป.5', TODAY, false)).toBe(false)
    expect(questVisibleToStudent(quest({ startAt: '2026-07-19' }), 'ป.5', TODAY, false)).toBe(true)
    expect(questVisibleToStudent(quest({ classes: ['ป.6'] }), 'ป.5', TODAY, false)).toBe(false)
  })

  it('never shows draft or archived quests to students', () => {
    expect(questVisibleToStudent(quest({ status: 'draft' }), 'ป.5', TODAY, true)).toBe(false)
    expect(questVisibleToStudent(quest({ status: 'archived' }), 'ป.5', TODAY, true)).toBe(false)
  })

  it('keeps a closed quest visible only for students who already accepted it', () => {
    expect(questVisibleToStudent(quest({ status: 'closed' }), 'ป.5', TODAY, true)).toBe(true)
    expect(questVisibleToStudent(quest({ status: 'closed' }), 'ป.5', TODAY, false)).toBe(false)
  })
})

describe('studentQuestStatus', () => {
  it('is AVAILABLE before the student accepts', () => {
    expect(studentQuestStatus(quest(), context(), TODAY)).toBe('AVAILABLE')
  })

  it('is IN_PROGRESS after accepting while objectives remain', () => {
    expect(studentQuestStatus(quest(), context({ state: { acceptedAt: '2026-07-18' } }), TODAY)).toBe('IN_PROGRESS')
  })

  it('is READY_TO_TURN_IN when every objective is complete from real data', () => {
    const done = context({ state: { acceptedAt: '2026-07-18' }, worksheetSubmitted: true })
    expect(studentQuestStatus(quest(), done, TODAY)).toBe('READY_TO_TURN_IN')
  })

  it('stays READY_TO_TURN_IN past the due date so late work can still be turned in', () => {
    const done = context({ state: { acceptedAt: '2026-07-01' }, worksheetSubmitted: true })
    expect(studentQuestStatus(quest({ dueAt: '2026-07-10' }), done, TODAY)).toBe('READY_TO_TURN_IN')
  })

  it('is COMPLETED once turned in, regardless of the due date', () => {
    const turned = context({ state: { acceptedAt: '2026-07-01', turnedInAt: '2026-07-05' }, worksheetSubmitted: true })
    expect(studentQuestStatus(quest({ dueAt: '2026-07-10' }), turned, TODAY)).toBe('COMPLETED')
  })

  it('is OVERDUE past the due date while work is incomplete, even before accepting', () => {
    expect(studentQuestStatus(quest({ dueAt: '2026-07-10' }), context(), TODAY)).toBe('OVERDUE')
    const started = context({ state: { acceptedAt: '2026-07-01' } })
    expect(studentQuestStatus(quest({ dueAt: '2026-07-10' }), started, TODAY)).toBe('OVERDUE')
    expect(studentQuestStatus(quest({ dueAt: '2026-07-19' }), started, TODAY)).toBe('IN_PROGRESS')
  })
})

describe('buildStudentQuestView objectives', () => {
  it('derives worksheet and posttest completion from the existing systems', () => {
    const view = buildStudentQuestView(
      quest({ objectives: ['study', 'posttest', 'worksheet'] }),
      context({ state: { acceptedAt: '2026-07-18' }, lessonPassed: true, worksheetSubmitted: false }),
      TODAY,
    )
    const byKey = Object.fromEntries(view.objectives.map((item) => [item.key, item.done]))
    expect(byKey).toEqual({ study: true, posttest: true, worksheet: false })
    expect(view.studentStatus).toBe('IN_PROGRESS')
  })

  it('marks study done once the lesson was opened through the quest flow', () => {
    const view = buildStudentQuestView(
      quest({ objectives: ['study'] }),
      context({ state: { acceptedAt: '2026-07-18', studiedAt: '2026-07-18' } }),
      TODAY,
    )
    expect(view.objectives[0].done).toBe(true)
    expect(view.studentStatus).toBe('READY_TO_TURN_IN')
  })

  it('previews the quest-configured turn-in reward', () => {
    const view = buildStudentQuestView(
      quest({ rewards: normalizeQuestRewards({ xp: 120, coins: 60 }) }),
      context(),
      TODAY,
    )
    expect(view.rewards).toMatchObject({ xp: 120, coins: 60 })
    expect(view.hasRewards).toBe(true)
  })

  it('reports no turn-in reward when the quest was configured without one', () => {
    const view = buildStudentQuestView(quest({ rewards: EMPTY_QUEST_REWARDS }), context(), TODAY)
    expect(view.hasRewards).toBe(false)
  })

  it('still surfaces the separate first-worksheet study reward for worksheet quests', () => {
    const view = buildStudentQuestView(quest({ objectives: ['study', 'worksheet'] }), context(), TODAY)
    expect(view.worksheetReward).toEqual({ xp: WORKSHEET_FIRST_SUBMIT_XP, coins: WORKSHEET_FIRST_SUBMIT_COINS })
    const noWorksheet = buildStudentQuestView(quest({ objectives: ['study'] }), context(), TODAY)
    expect(noWorksheet.worksheetReward).toBeNull()
  })

  it('previews the early-bird bonus while the due date has not passed', () => {
    const rewards = normalizeQuestRewards({ xp: 100, coins: 50, bonusXp: 30, bonusCoins: 10 })
    const early = buildStudentQuestView(quest({ rewards, dueAt: '2026-07-25' }), context(), TODAY)
    expect(early.earnable).toMatchObject({ xp: 130, coins: 60, earlyBonusApplied: true })
    const late = buildStudentQuestView(quest({ rewards, dueAt: '2026-07-01' }), context(), TODAY)
    expect(late.earnable).toMatchObject({ xp: 100, coins: 50, earlyBonusApplied: false })
  })
})

describe('normalizeQuestRewards', () => {
  it('coerces raw Firestore reward data into safe, capped numbers', () => {
    const rewards = normalizeQuestRewards({
      xp: '250', coins: 9999, bonusXp: -40, bonusCoins: 25,
      items: { potion: '3', magnifier: 0, ghostItem: 5 },
      cosmeticIds: ['hat-crown', 'not-a-real-item'],
      badge: '  ผู้พิชิตบทเรียน  ',
    })
    expect(rewards.xp).toBe(250)
    // Capped to the Firestore per-write delta ceiling.
    expect(rewards.coins).toBe(REWARD_COINS_MAX)
    // Negative bonuses are clamped away; zero-count items drop out.
    expect(rewards.bonusXp).toBe(0)
    expect(rewards.bonusCoins).toBe(25)
    expect(rewards.items).toEqual({ potion: 3 })
    expect(rewards.cosmeticIds).toEqual(['hat-crown'])
    expect(rewards.badge).toBe('ผู้พิชิตบทเรียน')
  })

  it('returns an empty reward set for missing or malformed data', () => {
    expect(normalizeQuestRewards(undefined)).toEqual(EMPTY_QUEST_REWARDS)
    expect(normalizeQuestRewards('nope')).toEqual(EMPTY_QUEST_REWARDS)
  })

  it('caps item quantities so a typo cannot flood the bag', () => {
    expect(normalizeQuestRewards({ items: { potion: 500 } }).items).toEqual({ potion: REWARD_ITEM_MAX_QTY })
  })
})

describe('hasQuestRewards', () => {
  it('is true when any reward channel carries something', () => {
    expect(hasQuestRewards(EMPTY_QUEST_REWARDS)).toBe(false)
    expect(hasQuestRewards(normalizeQuestRewards({ xp: 1 }))).toBe(true)
    expect(hasQuestRewards(normalizeQuestRewards({ items: { potion: 1 } }))).toBe(true)
    expect(hasQuestRewards(normalizeQuestRewards({ cosmeticIds: ['hat-crown'] }))).toBe(true)
    expect(hasQuestRewards(normalizeQuestRewards({ badge: 'ดาวเด่น' }))).toBe(true)
  })
})

describe('validateQuestRewards', () => {
  it('rejects a base + bonus total above the Firestore per-write delta cap', () => {
    const overXp = validateQuestRewards({ ...EMPTY_QUEST_REWARDS, xp: 900, bonusXp: 200 })
    expect(overXp.valid).toBe(false)
    const overCoins = validateQuestRewards({ ...EMPTY_QUEST_REWARDS, coins: 950, bonusCoins: 100 })
    expect(overCoins.valid).toBe(false)
  })

  it('accepts a reward set that stays inside the cap', () => {
    expect(validateQuestRewards(normalizeQuestRewards({ xp: 800, bonusXp: 200, coins: 500 })).valid).toBe(true)
    expect(validateQuestRewards(EMPTY_QUEST_REWARDS).valid).toBe(true)
  })
})

describe('earnedQuestRewards', () => {
  const rewards = normalizeQuestRewards({
    xp: 100, coins: 50, bonusXp: 40, bonusCoins: 20,
    items: { potion: 2 }, cosmeticIds: ['hat-crown'], badge: 'ดาวเด่น',
  })

  it('adds the early bonus when turned in on or before the due date', () => {
    expect(earnedQuestRewards(rewards, '2026-07-20', '2026-07-20')).toMatchObject({
      xp: 140, coins: 70, earlyBonusApplied: true,
    })
  })

  it('pays only the base reward after the due date', () => {
    expect(earnedQuestRewards(rewards, '2026-07-20', '2026-07-25')).toMatchObject({
      xp: 100, coins: 50, earlyBonusApplied: false,
    })
  })

  it('treats a quest with no due date as always eligible for the bonus', () => {
    expect(earnedQuestRewards(rewards, '', '2026-07-25').earlyBonusApplied).toBe(true)
  })

  it('carries the non-numeric reward channels through unchanged', () => {
    const earned = earnedQuestRewards(rewards, '', '2026-07-25')
    expect(earned.items).toEqual({ potion: 2 })
    expect(earned.cosmeticIds).toEqual(['hat-crown'])
    expect(earned.badge).toBe('ดาวเด่น')
  })
})

describe('grantQuestRewards', () => {
  const earned = earnedQuestRewards(normalizeQuestRewards({
    xp: 100, coins: 50, items: { potion: 2 }, cosmeticIds: ['hat-crown'], badge: 'ดาวเด่น',
  }), '', '2026-07-20')

  it('adds XP and coins on top of the current totals', () => {
    const granted = grantQuestRewards({ xp: 500, coins: 200, inventory: {} }, earned)
    expect(granted.xp).toBe(600)
    expect(granted.coins).toBe(250)
  })

  it('stacks consumables onto the existing bag instead of overwriting it', () => {
    const granted = grantQuestRewards({ xp: 0, coins: 0, inventory: { potion: 3, magnifier: 1 } }, earned)
    expect(granted.inventory.potion).toBe(5)
    expect(granted.inventory.magnifier).toBe(1)
  })

  it('adds wardrobe unlocks to the owned list without equipping or duplicating them', () => {
    const granted = grantQuestRewards(
      { xp: 0, coins: 0, inventory: { cosmetics: { owned: ['hat-crown', 'acc-scarf'], equipped: { hat: 'acc-scarf' } } } },
      earned,
    )
    const cosmetics = granted.inventory.cosmetics as { owned: string[]; equipped: Record<string, string> }
    expect(cosmetics.owned.filter((id) => id === 'hat-crown')).toHaveLength(1)
    expect(cosmetics.owned).toContain('acc-scarf')
    expect(cosmetics.equipped).toEqual({ hat: 'acc-scarf' })
  })

  it('appends the badge once, leaving earlier badges intact', () => {
    const granted = grantQuestRewards({ xp: 0, coins: 0, inventory: { badges: ['badge_streak_7', 'ดาวเด่น'] } }, earned)
    expect(granted.inventory.badges).toEqual(['badge_streak_7', 'ดาวเด่น'])
  })

  it('recomputes level and rank from the new XP total', () => {
    const granted = grantQuestRewards({ xp: 0, coins: 0, inventory: {} }, earned)
    expect(granted.level).toBe(levelForXp(100))
    expect(granted.rank).toBe(rankForXp(100))
  })

  it('never drives coins negative or loses an unrelated inventory key', () => {
    const granted = grantQuestRewards({ xp: 0, coins: 0, inventory: { worksheets: { L1: { answer: 'a' } } } }, earned)
    expect(granted.coins).toBeGreaterThanOrEqual(0)
    expect(granted.inventory.worksheets).toEqual({ L1: { answer: 'a' } })
  })
})

describe('questTargetLessonIds', () => {
  const viewWith = (questId: string, lessonId: string, override: Partial<StudentQuestContext>) =>
    buildStudentQuestView(quest({ questId, lessonId }), context(override), TODAY)

  it('marks lessons the student has accepted but not finished', () => {
    const inProgress = viewWith('TQ1', 'L1', { state: { acceptedAt: '2026-07-18' } })
    expect(questTargetLessonIds([inProgress])).toEqual(['L1'])
  })

  it('marks an overdue quest the student is still working on', () => {
    const overdue = buildStudentQuestView(
      quest({ questId: 'TQ2', lessonId: 'L2', dueAt: '2026-07-01' }),
      context({ state: { acceptedAt: '2026-06-30' } }),
      TODAY,
    )
    expect(overdue.studentStatus).toBe('OVERDUE')
    expect(questTargetLessonIds([overdue])).toEqual(['L2'])
  })

  it('drops a quest that is ready to turn in — the student should walk back to the NPC', () => {
    const ready = viewWith('TQ3', 'L3', { state: { acceptedAt: TODAY }, worksheetSubmitted: true })
    expect(ready.studentStatus).toBe('READY_TO_TURN_IN')
    expect(questTargetLessonIds([ready])).toEqual([])
  })

  it('drops completed and unaccepted quests', () => {
    const done = viewWith('TQ4', 'L4', { state: { acceptedAt: TODAY, turnedInAt: TODAY } })
    const notAccepted = viewWith('TQ5', 'L5', {})
    expect(questTargetLessonIds([done, notAccepted])).toEqual([])
  })

  it('de-duplicates two quests pointing at the same lesson', () => {
    const first = viewWith('TQ6', 'L6', { state: { acceptedAt: TODAY } })
    const second = viewWith('TQ7', 'L6', { state: { acceptedAt: TODAY } })
    expect(questTargetLessonIds([first, second])).toEqual(['L6'])
  })

  it('returns nothing for an empty board', () => {
    expect(questTargetLessonIds([])).toEqual([])
  })
})

describe('describeQuestRewards', () => {
  it('renders every configured channel as a human line', () => {
    const lines = describeQuestRewards(normalizeQuestRewards({
      xp: 100, coins: 50, items: { potion: 2 }, cosmeticIds: ['hat-crown'], badge: 'ดาวเด่น',
    }))
    expect(lines.join(' | ')).toContain('100 XP')
    expect(lines.join(' | ')).toContain('50')
    expect(lines.some((line) => line.includes('ยาเพิ่มพลัง'))).toBe(true)
    expect(lines.some((line) => line.includes('มงกุฎราชาแห่งปัญญา'))).toBe(true)
    expect(lines.some((line) => line.includes('ดาวเด่น'))).toBe(true)
  })

  it('returns an empty list when nothing is configured', () => {
    expect(describeQuestRewards(EMPTY_QUEST_REWARDS)).toEqual([])
  })
})

describe('npcMarkerForStatuses', () => {
  it('prioritizes turn-in over new quests over work in progress', () => {
    expect(npcMarkerForStatuses(['IN_PROGRESS', 'READY_TO_TURN_IN', 'AVAILABLE'])).toBe('ready')
    expect(npcMarkerForStatuses(['IN_PROGRESS', 'AVAILABLE'])).toBe('new')
    expect(npcMarkerForStatuses(['IN_PROGRESS', 'OVERDUE'])).toBe('working')
    expect(npcMarkerForStatuses(['COMPLETED'])).toBe('none')
    expect(npcMarkerForStatuses([])).toBe('none')
  })
})

describe('dialogueForQuest', () => {
  it('offers accepting a new quest with the teacher message', () => {
    const dialogue = dialogueForQuest(buildStudentQuestView(quest(), context(), TODAY))
    expect(dialogue.message).toContain('ศึกษาบทเรียนแล้วทำใบงาน')
    expect(dialogue.buttons.map((button) => button.action)).toEqual(['accept', 'detail', 'close'])
  })

  it('offers continuing and reviewing while in progress', () => {
    const dialogue = dialogueForQuest(buildStudentQuestView(quest(), context({ state: { acceptedAt: TODAY } }), TODAY))
    expect(dialogue.buttons.map((button) => button.action)).toEqual(['continue', 'detail', 'close'])
  })

  it('offers turn-in when the quest is ready', () => {
    const dialogue = dialogueForQuest(buildStudentQuestView(
      quest(), context({ state: { acceptedAt: TODAY }, worksheetSubmitted: true }), TODAY,
    ))
    expect(dialogue.buttons.map((button) => button.action)).toEqual(['turnIn', 'review', 'close'])
  })

  it('blocks turn-in and explains when the teacher closed the quest', () => {
    const dialogue = dialogueForQuest(buildStudentQuestView(
      quest({ status: 'closed' }), context({ state: { acceptedAt: TODAY }, worksheetSubmitted: true }), TODAY,
    ))
    expect(dialogue.buttons.some((button) => button.action === 'turnIn')).toBe(false)
    expect(dialogue.message).toContain('ปิดรับ')
  })

  it('congratulates a completed quest', () => {
    const dialogue = dialogueForQuest(buildStudentQuestView(
      quest(), context({ state: { acceptedAt: TODAY, turnedInAt: TODAY }, worksheetSubmitted: true }), TODAY,
    ))
    expect(dialogue.buttons.map((button) => button.action)).toEqual(['close'])
  })
})

describe('quest tracker helpers', () => {
  it('tracks the most urgent accepted quest: ready first, then overdue, then in progress', () => {
    const ready = buildStudentQuestView(quest({ questId: 'TQ-READY' }), context({ state: { acceptedAt: TODAY }, worksheetSubmitted: true }), TODAY)
    const inProgress = buildStudentQuestView(quest({ questId: 'TQ-WORK' }), context({ state: { acceptedAt: TODAY } }), TODAY)
    const overdue = buildStudentQuestView(quest({ questId: 'TQ-LATE', dueAt: '2026-07-01' }), context({ state: { acceptedAt: '2026-06-20' } }), TODAY)
    const fresh = buildStudentQuestView(quest({ questId: 'TQ-NEW' }), context(), TODAY)

    expect(trackedQuest([inProgress, overdue, ready, fresh])?.questId).toBe('TQ-READY')
    expect(trackedQuest([inProgress, overdue, fresh])?.questId).toBe('TQ-LATE')
    expect(trackedQuest([inProgress, fresh])?.questId).toBe('TQ-WORK')
    expect(trackedQuest([fresh])).toBeNull()
  })

  it('tells the player the next concrete step', () => {
    const ready = buildStudentQuestView(quest(), context({ state: { acceptedAt: TODAY }, worksheetSubmitted: true }), TODAY)
    expect(trackerHint(ready)).toContain(TEACHER_NPC_NAME)
    const working = buildStudentQuestView(quest({ objectives: ['study', 'worksheet'] }), context({ state: { acceptedAt: TODAY, studiedAt: TODAY } }), TODAY)
    expect(trackerHint(working)).toBe(OBJECTIVE_LABELS.worksheet)
  })
})

describe('newQuestIdsToNotify', () => {
  it('notifies only unseen available quests so refreshing never re-triggers the toast', () => {
    const views = [
      buildStudentQuestView(quest({ questId: 'TQ-A' }), context(), TODAY),
      buildStudentQuestView(quest({ questId: 'TQ-B' }), context(), TODAY),
      buildStudentQuestView(quest({ questId: 'TQ-C' }), context({ state: { acceptedAt: TODAY } }), TODAY),
    ]
    expect(newQuestIdsToNotify(views, ['TQ-A'])).toEqual(['TQ-B'])
    expect(newQuestIdsToNotify(views, ['TQ-A', 'TQ-B'])).toEqual([])
  })
})

describe('availableObjectivesForLesson', () => {
  it('disables objectives the lesson cannot support and explains why', () => {
    const options = availableObjectivesForLesson({ questionCount: 0, content: '', worksheetUrl: '' })
    const byKey = Object.fromEntries(options.map((option) => [option.key, option]))
    expect(byKey.study.enabled).toBe(true)
    expect(byKey.posttest.enabled).toBe(false)
    expect(byKey.posttest.reason).toBeTruthy()
    expect(byKey.worksheet.enabled).toBe(false)
  })

  it('enables worksheet when the lesson has content or a worksheet link', () => {
    expect(availableObjectivesForLesson({ questionCount: 3, content: 'สรุปเนื้อหา', worksheetUrl: '' })
      .find((option) => option.key === 'worksheet')?.enabled).toBe(true)
    expect(availableObjectivesForLesson({ questionCount: 3, content: '', worksheetUrl: 'https://example.com' })
      .find((option) => option.key === 'worksheet')?.enabled).toBe(true)
  })
})

describe('validateTeacherQuestDraft', () => {
  const lesson = { questionCount: 5, content: 'เนื้อหา', worksheetUrl: '' }

  it('accepts a well-formed draft', () => {
    expect(validateTeacherQuestDraft(quest(), lesson)).toEqual({ valid: true })
  })

  it('requires a lesson, a title and at least one objective', () => {
    expect(validateTeacherQuestDraft(quest({ lessonId: '' }), lesson).valid).toBe(false)
    expect(validateTeacherQuestDraft(quest({ title: '  ' }), lesson).valid).toBe(false)
    expect(validateTeacherQuestDraft(quest({ objectives: [] }), lesson).valid).toBe(false)
  })

  it('rejects objectives the lesson cannot support', () => {
    const result = validateTeacherQuestDraft(
      quest({ objectives: ['posttest'] }),
      { questionCount: 0, content: 'x', worksheetUrl: '' },
    )
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('rejects a due date before the start date', () => {
    expect(validateTeacherQuestDraft(quest({ startAt: '2026-07-20', dueAt: '2026-07-10' }), lesson).valid).toBe(false)
    expect(validateTeacherQuestDraft(quest({ startAt: '2026-07-10', dueAt: '2026-07-10' }), lesson).valid).toBe(true)
  })
})

describe('aggregateTeacherQuestStats', () => {
  it('counts targeted students by their derived status', () => {
    const stats = aggregateTeacherQuestStats(quest({ classes: ['ป.5'], dueAt: '2026-07-10' }), [
      { class: 'ป.5', lessonPassed: false, worksheetSubmitted: false },
      { class: 'ป.5', state: { acceptedAt: '2026-07-01' }, lessonPassed: false, worksheetSubmitted: false },
      { class: 'ป.5', state: { acceptedAt: '2026-07-01' }, lessonPassed: false, worksheetSubmitted: true },
      { class: 'ป.5', state: { acceptedAt: '2026-07-01', turnedInAt: '2026-07-02' }, lessonPassed: false, worksheetSubmitted: true },
      { class: 'ป.4', lessonPassed: false, worksheetSubmitted: false },
    ], TODAY)

    expect(stats).toEqual({ assigned: 4, notStarted: 0, inProgress: 0, ready: 1, completed: 1, overdue: 2 })
  })

  it('splits fresh and working students when nothing is overdue', () => {
    const stats = aggregateTeacherQuestStats(quest(), [
      { class: 'ป.5', lessonPassed: false, worksheetSubmitted: false },
      { class: 'ป.6', state: { acceptedAt: TODAY }, lessonPassed: false, worksheetSubmitted: false },
    ], TODAY)
    expect(stats).toEqual({ assigned: 2, notStarted: 1, inProgress: 1, ready: 0, completed: 0, overdue: 0 })
  })
})

describe('labels and defaults', () => {
  it('builds the default quest title from the lesson name', () => {
    expect(defaultQuestTitle('ความปลอดภัยบนโลกออนไลน์')).toBe('ภารกิจ: ความปลอดภัยบนโลกออนไลน์')
  })

  it('has a Thai label for every student status', () => {
    for (const status of ['AVAILABLE', 'IN_PROGRESS', 'READY_TO_TURN_IN', 'COMPLETED', 'OVERDUE'] as const) {
      expect(STUDENT_STATUS_LABELS[status]).toBeTruthy()
    }
  })
})
