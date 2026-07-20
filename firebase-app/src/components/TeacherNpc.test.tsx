// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  buildStudentQuestView,
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
  const onOpenLesson = vi.fn()
  render(<TeacherNpc service={service} onOpenLesson={onOpenLesson} />)
  return { service, onOpenLesson }
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

  it('continues the quest into the original lesson flow and marks study done', async () => {
    const { service, onOpenLesson } = setup([view({}, { state: { acceptedAt: TODAY } })])
    await settle()

    fireEvent.click(await screen.findByRole('button', { name: /พูดคุยกับครูวีรภัทร์/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'ทำภารกิจต่อ' }))

    await waitFor(() => expect(service.markStudied).toHaveBeenCalledWith('user-1', 'TQ001'))
    expect(onOpenLesson).toHaveBeenCalledWith('L1')
    expect(screen.queryByTestId('npc-dialogue')).toBeNull()
  })

  it('turns in a ready quest and celebrates with the already-earned rewards', async () => {
    const ready = view({}, { state: { acceptedAt: TODAY }, worksheetSubmitted: true })
    const done = view({}, { state: { acceptedAt: TODAY, turnedInAt: TODAY }, worksheetSubmitted: true })
    const { service } = setup([ready], {
      loadQuestBoard: vi.fn()
        .mockResolvedValueOnce({ success: true, data: [ready] })
        .mockResolvedValue({ success: true, data: [done] }),
    })
    await settle()

    fireEvent.click(await screen.findByRole('button', { name: /พูดคุยกับครูวีรภัทร์/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'ส่งงาน' }))

    await waitFor(() => expect(service.turnInQuest).toHaveBeenCalledWith('user-1', 'TQ001'))
    const celebration = await screen.findByTestId('npc-celebration')
    expect(celebration.textContent).toContain('ภารกิจสำเร็จ!')
    expect(celebration.textContent).toContain('ภารกิจ: ความปลอดภัยบนโลกออนไลน์')
    expect(celebration.textContent).toContain('40')
    expect(celebration.textContent).toContain('25')

    fireEvent.click(screen.getByRole('button', { name: 'รับรางวัล' }))
    await waitFor(() => expect(screen.queryByTestId('npc-celebration')).toBeNull())
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
})
