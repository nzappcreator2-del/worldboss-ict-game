// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HUB_PLAYER_POSITION_EVENT, TeacherNpc, type TeacherNpcService } from './TeacherNpc'
import {
  BLINK_DELAY_MIN_MS,
  BLINK_GAP_MS,
  BLINK_HOLD_MS,
  IDLE_BASE_FRAME,
  IDLE_BLINK_FRAME,
} from './teacherNpcSprite'
import { TEACHER_SHEET } from './teacherNpcSheet.generated'
import {
  EMPTY_QUEST_REWARDS,
  buildStudentQuestView,
  normalizeQuestRewards,
  type StudentQuestContext,
  type StudentQuestView,
  type TeacherQuest,
} from '../services/teacherQuestLogic'

const TODAY = '2026-07-19'

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

const view = (questOverride: Partial<TeacherQuest> = {}, context: Partial<StudentQuestContext> = {}): StudentQuestView =>
  buildStudentQuestView(quest(questOverride), { lessonPassed: false, worksheetSubmitted: false, ...context }, TODAY)

function setup(views: StudentQuestView[], serviceOverride: Partial<TeacherNpcService> = {}) {
  const service: TeacherNpcService = {
    getCurrentUser: () => ({ id: 'user-1' }),
    loadQuestBoard: vi.fn().mockResolvedValue({ success: true, data: views }),
    acceptQuest: vi.fn().mockResolvedValue({ success: true }),
    markStudied: vi.fn().mockResolvedValue({ success: true }),
    turnInQuest: vi.fn().mockResolvedValue({ success: true, alreadyTurnedIn: false }),
    ...serviceOverride,
  }
  const onOpenMap = vi.fn()
  const onUserUpdate = vi.fn()
  render(<TeacherNpc service={service} onOpenMap={onOpenMap} onUserUpdate={onUserUpdate} />)
  return { service, onOpenMap, onUserUpdate }
}

// The NPC loads its quest board on mount (guild-hall home scene); a zero
// timeout inside act drains the whole mocked-fetch microtask chain so tests
// query a settled board deterministically.
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => sessionStorage.clear())
afterEach(cleanup)

describe('TeacherNpc', () => {
  it('stands in the guild hall with name, role and a golden marker for a new quest', async () => {
    setup([view()])
    await settle()

    const npc = await screen.findByTestId('teacher-npc')
    expect(npc.textContent).toContain('ครูวีรภัทร์')
    expect(npc.textContent).toContain('ผู้มอบหมายภารกิจ')
    await waitFor(() => expect(screen.getByTestId('npc-marker').getAttribute('data-marker')).toBe('new'))
  })

  it('shows the turn-in marker when a quest is ready and none when everything is done', async () => {
    setup([view({}, { state: { acceptedAt: TODAY }, worksheetSubmitted: true })])
    await settle()
    await waitFor(() => expect(screen.getByTestId('npc-marker').getAttribute('data-marker')).toBe('ready'))

    cleanup()
    setup([view({}, { state: { acceptedAt: TODAY, turnedInAt: TODAY }, worksheetSubmitted: true })])
    await settle()
    await waitFor(() => expect(screen.queryByTestId('npc-marker')).toBeNull())
  })

  it('opens an RPG dialogue and accepts the quest through the service', async () => {
    const accepted = view({}, { state: { acceptedAt: TODAY } })
    // The board loads once on mount, so the mock chain must exist pre-render:
    // first call (mount) sees the fresh quest, later calls the accepted one.
    const { service } = setup([view()], {
      acceptQuest: vi.fn().mockResolvedValue({ success: true }),
      loadQuestBoard: vi.fn()
        .mockResolvedValueOnce({ success: true, data: [view()] })
        .mockResolvedValue({ success: true, data: [accepted] }),
    })
    await settle()

    fireEvent.click(await screen.findByRole('button', { name: /พูดคุยกับครูวีรภัทร์/ }))
    const dialogue = await screen.findByTestId('npc-dialogue')
    expect(dialogue.textContent).toContain('ศึกษาบทเรียนแล้วทำใบงานให้เรียบร้อย')

    fireEvent.click(screen.getByRole('button', { name: 'รับภารกิจ' }))
    await waitFor(() => expect(service.acceptQuest).toHaveBeenCalledWith('user-1', 'TQ001'))
    await screen.findByRole('button', { name: 'ทำภารกิจต่อ' })
  })

  // The student should walk into the lesson themselves from the adventure map
  // rather than being teleported straight into combat.
  it('sends the student to the adventure map instead of warping into the lesson', async () => {
    const { onOpenMap } = setup([view({}, { state: { acceptedAt: TODAY } })])
    await settle()

    fireEvent.click(await screen.findByRole('button', { name: /พูดคุยกับครูวีรภัทร์/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'ทำภารกิจต่อ' }))

    expect(onOpenMap).toHaveBeenCalledWith('L1')
    expect(screen.queryByTestId('npc-dialogue')).toBeNull()
  })

  it('does not claim the lesson was studied just for walking to the map', async () => {
    const { service } = setup([view({}, { state: { acceptedAt: TODAY } })])
    await settle()

    fireEvent.click(await screen.findByRole('button', { name: /พูดคุยกับครูวีรภัทร์/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'ทำภารกิจต่อ' }))

    // The study stamp now belongs to actually opening the lesson.
    expect(service.markStudied).not.toHaveBeenCalled()
  })

  it('also routes the review action through the map', async () => {
    const { onOpenMap } = setup([view({}, { state: { acceptedAt: TODAY }, worksheetSubmitted: true })])
    await settle()

    fireEvent.click(await screen.findByRole('button', { name: /พูดคุยกับครูวีรภัทร์/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'ตรวจคำตอบอีกครั้ง' }))

    expect(onOpenMap).toHaveBeenCalledWith('L1')
  })

  it('turns in a ready quest and celebrates with the rewards the server actually paid', async () => {
    const rewards = normalizeQuestRewards({ xp: 120, coins: 60, items: { potion: 2 }, badge: 'ดาวเด่น' })
    const ready = view({ rewards }, { state: { acceptedAt: TODAY }, worksheetSubmitted: true })
    const done = view({ rewards }, { state: { acceptedAt: TODAY, turnedInAt: TODAY }, worksheetSubmitted: true })
    const { service } = setup([ready], {
      loadQuestBoard: vi.fn()
        .mockResolvedValueOnce({ success: true, data: [ready] })
        .mockResolvedValue({ success: true, data: [done] }),
      turnInQuest: vi.fn().mockResolvedValue({
        success: true,
        alreadyTurnedIn: false,
        earned: { xp: 120, coins: 60, items: { potion: 2 }, cosmeticIds: [], badge: 'ดาวเด่น', earlyBonusApplied: false },
      }),
    })
    await settle()

    fireEvent.click(await screen.findByRole('button', { name: /พูดคุยกับครูวีรภัทร์/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'ส่งงาน' }))

    await waitFor(() => expect(service.turnInQuest).toHaveBeenCalledWith('user-1', 'TQ001'))
    const celebration = await screen.findByTestId('npc-celebration')
    expect(celebration.textContent).toContain('ภารกิจสำเร็จ!')
    expect(celebration.textContent).toContain('ภารกิจ: ความปลอดภัยบนโลกออนไลน์')
    expect(celebration.textContent).toContain('120 XP')
    expect(celebration.textContent).toContain('60')
    expect(celebration.textContent).toContain('ยาเพิ่มพลัง')
    expect(celebration.textContent).toContain('ดาวเด่น')

    fireEvent.click(screen.getByRole('button', { name: 'รับรางวัล' }))
    await waitFor(() => expect(screen.queryByTestId('npc-celebration')).toBeNull())
  })

  // The HUD reads the legacy in-memory user object, so the payout has to be
  // pushed back into it — dispatching an event alone re-reads stale values and
  // forces the student to refresh before they see their reward.
  it('pushes the paid reward back into the shared user so the HUD updates without a refresh', async () => {
    const ready = view({}, { state: { acceptedAt: TODAY }, worksheetSubmitted: true })
    const stats = { xp: 620, coins: 260, level: 4, rank: 'SILVER', inventory: { potion: 2 } }
    const { onUserUpdate } = setup([ready], {
      turnInQuest: vi.fn().mockResolvedValue({
        success: true,
        alreadyTurnedIn: false,
        earned: { xp: 120, coins: 60, items: {}, cosmeticIds: [], badge: '', earlyBonusApplied: false },
        stats,
      }),
    })
    await settle()

    fireEvent.click(await screen.findByRole('button', { name: /พูดคุยกับครูวีรภัทร์/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'ส่งงาน' }))

    await waitFor(() => expect(onUserUpdate).toHaveBeenCalledWith(stats))
  })

  it('does not touch the shared user when the quest was already turned in', async () => {
    const ready = view({}, { state: { acceptedAt: TODAY }, worksheetSubmitted: true })
    const { onUserUpdate } = setup([ready], {
      turnInQuest: vi.fn().mockResolvedValue({ success: true, alreadyTurnedIn: true }),
    })
    await settle()

    fireEvent.click(await screen.findByRole('button', { name: /พูดคุยกับครูวีรภัทร์/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'ส่งงาน' }))

    await waitFor(() => expect(screen.queryByTestId('npc-celebration')).toBeNull())
    expect(onUserUpdate).not.toHaveBeenCalled()
  })

  it('celebrates a level-up only when the reward actually raised the level', async () => {
    const ready = view({}, { state: { acceptedAt: TODAY }, worksheetSubmitted: true })
    setup([ready], {
      getCurrentUser: () => ({ id: 'user-1', level: 3 }),
      turnInQuest: vi.fn().mockResolvedValue({
        success: true,
        alreadyTurnedIn: false,
        earned: { xp: 500, coins: 0, items: {}, cosmeticIds: [], badge: '', earlyBonusApplied: false },
        stats: { xp: 900, coins: 0, level: 5, rank: 'GOLD' },
      }),
    })
    await settle()

    fireEvent.click(await screen.findByRole('button', { name: /พูดคุยกับครูวีรภัทร์/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'ส่งงาน' }))

    const celebration = await screen.findByTestId('npc-celebration')
    expect(celebration.textContent).toContain('LEVEL UP')
    expect(celebration.textContent).toContain('5')
  })

  it('shows no level-up banner when the level stayed the same', async () => {
    const ready = view({}, { state: { acceptedAt: TODAY }, worksheetSubmitted: true })
    setup([ready], {
      getCurrentUser: () => ({ id: 'user-1', level: 3 }),
      turnInQuest: vi.fn().mockResolvedValue({
        success: true,
        alreadyTurnedIn: false,
        earned: { xp: 20, coins: 0, items: {}, cosmeticIds: [], badge: '', earlyBonusApplied: false },
        stats: { xp: 420, coins: 0, level: 3, rank: 'SILVER' },
      }),
    })
    await settle()

    fireEvent.click(await screen.findByRole('button', { name: /พูดคุยกับครูวีรภัทร์/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'ส่งงาน' }))

    const celebration = await screen.findByTestId('npc-celebration')
    expect(celebration.textContent).not.toContain('LEVEL UP')
  })

  it('announces the early-submission bonus when the server applied it', async () => {
    const rewards = normalizeQuestRewards({ xp: 100, coins: 50, bonusXp: 30, bonusCoins: 10 })
    const ready = view({ rewards, dueAt: '2026-07-25' }, { state: { acceptedAt: TODAY }, worksheetSubmitted: true })
    setup([ready], {
      turnInQuest: vi.fn().mockResolvedValue({
        success: true,
        alreadyTurnedIn: false,
        earned: { xp: 130, coins: 60, items: {}, cosmeticIds: [], badge: '', earlyBonusApplied: true },
      }),
    })
    await settle()

    fireEvent.click(await screen.findByRole('button', { name: /พูดคุยกับครูวีรภัทร์/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'ส่งงาน' }))

    const celebration = await screen.findByTestId('npc-celebration')
    expect(celebration.textContent).toContain('130 XP')
    expect(celebration.textContent).toContain('โบนัสส่งก่อนกำหนด')
  })

  it('celebrates without a reward block when the quest carries no reward', async () => {
    const ready = view({}, { state: { acceptedAt: TODAY }, worksheetSubmitted: true })
    setup([ready], {
      turnInQuest: vi.fn().mockResolvedValue({ success: true, alreadyTurnedIn: false }),
    })
    await settle()

    fireEvent.click(await screen.findByRole('button', { name: /พูดคุยกับครูวีรภัทร์/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'ส่งงาน' }))

    const celebration = await screen.findByTestId('npc-celebration')
    expect(celebration.textContent).toContain('ภารกิจสำเร็จ!')
    expect(celebration.querySelector('.npc-celebration-rewards')).toBeNull()
  })

  it('surfaces a turn-in failure with a Thai error inside the dialogue', async () => {
    const ready = view({}, { state: { acceptedAt: TODAY }, worksheetSubmitted: true })
    setup([ready], {
      turnInQuest: vi.fn().mockResolvedValue({ success: false, error: 'ยังทำภารกิจไม่ครบทุกเป้าหมาย' }),
    })
    await settle()

    fireEvent.click(await screen.findByRole('button', { name: /พูดคุยกับครูวีรภัทร์/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'ส่งงาน' }))

    await waitFor(() => expect(screen.getByTestId('npc-dialogue').textContent).toContain('ยังทำภารกิจไม่ครบ'))
  })

  it('tracks the active quest in a compact side tracker that reopens the dialogue', async () => {
    setup([view({}, { state: { acceptedAt: TODAY } })])
    await settle()

    const tracker = await screen.findByTestId('npc-tracker')
    expect(tracker.textContent).toContain('ภารกิจ: ความปลอดภัยบนโลกออนไลน์')
    expect(tracker.textContent).toContain('ทำใบงานส่งครู')

    fireEvent.click(tracker)
    await screen.findByTestId('npc-dialogue')
  })

  it('announces a fresh quest once and stays quiet after refreshing', async () => {
    setup([view()])
    await settle()
    expect((await screen.findByTestId('npc-toast')).textContent).toContain('มีภารกิจใหม่จากครูวีรภัทร์')

    cleanup()
    setup([view()])
    await settle()
    await screen.findByTestId('teacher-npc')
    expect(screen.queryByTestId('npc-toast')).toBeNull()
  })

  it('keeps the NPC standing when the quest board fails to load and offers a retry', async () => {
    const { service } = setup([], {
      loadQuestBoard: vi.fn().mockResolvedValue({ success: false, error: 'network down' }),
    })
    await settle()

    fireEvent.click(await screen.findByRole('button', { name: /พูดคุยกับครูวีรภัทร์/ }))
    const dialogue = await screen.findByTestId('npc-dialogue')
    expect(dialogue.textContent).toContain('ยังโหลดภารกิจไม่สำเร็จ')

    fireEvent.click(screen.getByRole('button', { name: 'ลองใหม่' }))
    await waitFor(() => expect(service.loadQuestBoard).toHaveBeenCalledTimes(2))
  })

  it('greets politely when there is no quest today', async () => {
    setup([])
    await settle()

    fireEvent.click(await screen.findByRole('button', { name: /พูดคุยกับครูวีรภัทร์/ }))
    expect((await screen.findByTestId('npc-dialogue')).textContent).toContain('วันนี้ยังไม่มีภารกิจใหม่')
  })

  it('opens the quest detail card with real objectives and rewards', async () => {
    setup([view()])
    await settle()

    fireEvent.click(await screen.findByRole('button', { name: /พูดคุยกับครูวีรภัทร์/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'ดูรายละเอียด' }))

    const detail = await screen.findByTestId('npc-quest-detail')
    expect(detail.textContent).toContain('ความปลอดภัยบนโลกออนไลน์')
    expect(detail.textContent).toContain('ครูวีรภัทร์')
    expect(detail.textContent).toContain('ศึกษาบทเรียน')
    expect(detail.textContent).toContain('ทำใบงานส่งครู')
    expect(detail.textContent).toContain('40')
  })

  it('stands calmly on the neutral idle frame — even with a new quest and an open dialogue', async () => {
    setup([view()])
    await settle()
    const art = () => document.querySelector('.teacher-npc-art') as HTMLElement

    expect(art().getAttribute('data-pose')).toBe('idle')
    expect(art().getAttribute('data-frame')).toBe(String(IDLE_BASE_FRAME))
    expect(art().style.backgroundImage).toContain('url(')

    fireEvent.click(await screen.findByRole('button', { name: /พูดคุยกับครูวีรภัทร์/ }))
    await screen.findByTestId('npc-dialogue')
    expect(art().getAttribute('data-pose')).toBe('idle')
  })

  it('blinks on a calm human cadence and reopens the eyes', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      setup([])
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      const art = () => document.querySelector('.teacher-npc-art') as HTMLElement
      expect(art().getAttribute('data-frame')).toBe(String(IDLE_BASE_FRAME))

      // random=0 → shortest pause, then a double blink (blink, gap, blink).
      await act(async () => { await vi.advanceTimersByTimeAsync(BLINK_DELAY_MIN_MS + 5) })
      expect(art().getAttribute('data-frame')).toBe(String(IDLE_BLINK_FRAME))
      await act(async () => { await vi.advanceTimersByTimeAsync(BLINK_HOLD_MS) })
      expect(art().getAttribute('data-frame')).toBe(String(IDLE_BASE_FRAME))
      await act(async () => { await vi.advanceTimersByTimeAsync(BLINK_GAP_MS) })
      expect(art().getAttribute('data-frame')).toBe(String(IDLE_BLINK_FRAME))
      await act(async () => { await vi.advanceTimersByTimeAsync(BLINK_HOLD_MS) })
      expect(art().getAttribute('data-frame')).toBe(String(IDLE_BASE_FRAME))
    } finally {
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })

  it('shows one static celebrate frame in the overlay while the teacher keeps standing calm', async () => {
    const ready = view({}, { state: { acceptedAt: TODAY }, worksheetSubmitted: true })
    setup([ready])
    await settle()

    fireEvent.click(await screen.findByRole('button', { name: /พูดคุยกับครูวีรภัทร์/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'ส่งงาน' }))
    const celebration = await screen.findByTestId('npc-celebration')

    const sprite = celebration.querySelector('.npc-celebration-sprite i') as HTMLElement
    expect(sprite.style.backgroundPosition).toContain(`${-TEACHER_SHEET.rows.celebrate * TEACHER_SHEET.frameHeight * 0.62}px`)
    expect(document.querySelector('.teacher-npc-art')?.getAttribute('data-pose')).toBe('idle')
  })

  it('invites the player to talk when they walk up to the teacher', async () => {
    setup([view()])
    await settle()
    await screen.findByTestId('teacher-npc')

    act(() => {
      window.dispatchEvent(new CustomEvent(HUB_PLAYER_POSITION_EVENT, { detail: { x: 50, y: 44 } }))
    })
    expect(screen.getByText(/แตะเพื่อพูดคุย/)).toBeTruthy()

    fireEvent.keyDown(window, { key: 'e' })
    await screen.findByTestId('npc-dialogue')
    fireEvent.click(screen.getByRole('button', { name: 'ปิดบทสนทนา' }))

    act(() => {
      window.dispatchEvent(new CustomEvent(HUB_PLAYER_POSITION_EVENT, { detail: { x: 10, y: 90 } }))
    })
    expect(screen.queryByText(/แตะเพื่อพูดคุย/)).toBeNull()
  })

  it('locks a finished quest tab with a "เสร็จแล้ว" badge and blocks switching to it', async () => {
    const finished = view(
      { questId: 'TQ001', title: 'ภารกิจ: หลักการทำงานของคอมพิวเตอร์' },
      { state: { acceptedAt: TODAY, turnedInAt: TODAY }, worksheetSubmitted: true },
    )
    const inProgress = view(
      { questId: 'TQ002', title: 'ภารกิจ: ผจญภัยในหมู่บ้านไคโนะ' },
      { state: { acceptedAt: TODAY } },
    )
    setup([finished, inProgress])
    await settle()

    fireEvent.click(await screen.findByRole('button', { name: /พูดคุยกับครูวีรภัทร์/ }))
    const switcher = await screen.findByRole('tablist', { name: 'เลือกภารกิจ' })
    const finishedTab = within(switcher).getByRole('tab', { name: /หลักการทำงานของคอมพิวเตอร์/ })

    expect(finishedTab.textContent).toContain('เสร็จแล้ว')
    expect(finishedTab.hasAttribute('disabled')).toBe(true)

    fireEvent.click(finishedTab)
    expect(screen.getByRole('heading', { name: 'ภารกิจ: ผจญภัยในหมู่บ้านไคโนะ' })).toBeTruthy()
  })
})
