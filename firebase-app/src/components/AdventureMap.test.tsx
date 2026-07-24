// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdventureMap, type MapService } from './AdventureMap'
import { EMPTY_QUEST_REWARDS, buildStudentQuestView, type TeacherQuest } from '../services/teacherQuestLogic'

const lessons = [
  { id: 'L1', title: 'ด่านป่าเริ่มต้น', description: 'เรียนรู้พื้นฐาน', icon: '🌳' },
  { id: 'L2', title: 'ถ้ำแห่งความมืด', description: 'ทดสอบความรู้', icon: '🦇' },
  { id: 'L3', title: 'ปราสาทมังกร', description: 'ด่านสุดท้าย', icon: '🏰' },
]

afterEach(cleanup)

function setup(passedLessons: string[] = ['L1'], overrides: Partial<MapService> = {}) {
  const service: MapService = {
    getCurrentUser: () => ({ id: 'user-1', avatar: '🧙', passedLessons }),
    loadLessons: vi.fn().mockResolvedValue({ success: true, data: lessons, passedLessons }),
    ...overrides,
  }
  const onSelectLesson = vi.fn()
  const onOpenNpc = vi.fn()
  render(<AdventureMap service={service} onSelectLesson={onSelectLesson} onOpenNpc={onOpenNpc} />)
  return { service, onSelectLesson, onOpenNpc }
}

function positionStyle(node: HTMLElement) {
  const style = node.getAttribute('style') || ''
  return style.match(/left:[^;]+; top:[^;]+;/)?.[0] || style
}

function backgroundPosition(node: HTMLElement) {
  const style = node.getAttribute('style') || ''
  return style.match(/background-position:[^;]+;/)?.[0] || ''
}

describe('AdventureMap', () => {
  it('renders the full-screen RPG map surface with the current player character', async () => {
    setup()
    window.dispatchEvent(new Event('nextgen:open-map'))

    expect(await screen.findByTestId('adventure-map')).toBeTruthy()
    const world = screen.getByTestId('map-world')
    expect(world.classList.contains('adventure-camera-world')).toBe(true)
    expect(screen.getByTestId('map-character').getAttribute('data-avatar')).toBe('🧙')
    expect(world.contains(screen.getByLabelText('จอยสติ๊กควบคุมแผนที่'))).toBe(false)
  })

  it('loads progress only when the legacy dashboard opens the map', async () => {
    const { service } = setup()
    expect(service.loadLessons).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('nextgen:open-map'))

    await screen.findByRole('button', { name: 'เล่นด่าน ด่านป่าเริ่มต้น' })
    expect(service.loadLessons).toHaveBeenCalledWith('user-1')
  })

  it('unlocks the first lesson and the lesson following a passed lesson', async () => {
    setup()
    window.dispatchEvent(new Event('nextgen:open-map'))

    expect((await screen.findByRole('button', { name: 'เล่นด่าน ถ้ำแห่งความมืด' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: 'ด่านล็อก ปราสาทมังกร' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('draws each lesson entrance as big SVG landmark art with template fallback by index', async () => {
    setup()
    window.dispatchEvent(new Event('nextgen:open-map'))

    const first = await screen.findByTestId('lesson-node-L1')
    expect(first.querySelector('svg')).toBeTruthy()
    expect(first.getAttribute('data-entrance')).toBe('forest-gate')
    expect(screen.getByTestId('lesson-node-L2').getAttribute('data-entrance')).toBe('stone-keep')
  })

  it('uses the lesson mapStyle template when the teacher picked one', async () => {
    const service: MapService = {
      getCurrentUser: () => ({ id: 'user-1', avatar: '🧙', passedLessons: [] }),
      loadLessons: vi.fn().mockResolvedValue({
        success: true,
        data: [{ id: 'L9', title: 'ด่านพิเศษ', description: 'ทดสอบ', icon: '🔥', mapStyle: 'volcano-forge' }],
        passedLessons: [],
      }),
    }
    render(<AdventureMap service={service} onSelectLesson={vi.fn()} />)
    window.dispatchEvent(new Event('nextgen:open-map'))

    const node = await screen.findByTestId('lesson-node-L9')
    expect(node.getAttribute('data-entrance')).toBe('volcano-forge')
  })

  it('shows painted reward chips inside the lesson preview panel', async () => {
    setup()
    window.dispatchEvent(new Event('nextgen:open-map'))

    const lesson = await screen.findByRole('button', { name: 'เล่นด่าน ถ้ำแห่งความมืด' })
    vi.useFakeTimers()
    try {
      fireEvent.click(lesson)
      await vi.advanceTimersByTimeAsync(1000)
      const dialog = screen.getByRole('dialog', { name: 'ตัวอย่างบทเรียน' })
      expect(dialog.textContent).toContain('โบนัส XP')
      expect(dialog.textContent).toContain('ความรู้ใหม่')
      expect(dialog.querySelector('.map-preview-entrance svg')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('previews an unlocked lesson and enters it only after confirmation', async () => {
    const { onSelectLesson } = setup()
    window.dispatchEvent(new Event('nextgen:open-map'))

    const lesson = await screen.findByRole('button', { name: 'เล่นด่าน ถ้ำแห่งความมืด' })
    vi.useFakeTimers()
    try {
      fireEvent.click(lesson)
      await vi.advanceTimersByTimeAsync(1000)
      expect(screen.getByRole('dialog', { name: 'ตัวอย่างบทเรียน' })).toBeTruthy()
      expect(onSelectLesson).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'บุกโจมตี!' }))
      expect(onSelectLesson).toHaveBeenCalledWith('L2')
    } finally {
      vi.useRealTimers()
    }
  })

  it('auto-walks to an unlocked lesson before opening its preview', async () => {
    setup()
    window.dispatchEvent(new Event('nextgen:open-map'))
    const node = await screen.findByTestId('lesson-node-L2')

    vi.useFakeTimers()
    try {
      fireEvent.click(node)
      expect(screen.getByTestId('map-character').getAttribute('data-walking')).toBe('true')
      expect(screen.queryByRole('dialog', { name: 'ตัวอย่างบทเรียน' })).toBeNull()

      await vi.advanceTimersByTimeAsync(1000)
      expect(screen.getByRole('dialog', { name: 'ตัวอย่างบทเรียน' })).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('supports smooth held-key movement while the map is active', async () => {
    setup()
    window.dispatchEvent(new Event('nextgen:open-map'))
    await screen.findByTestId('lesson-node-L1')
    const character = screen.getByTestId('map-character')
    const start = character.getAttribute('style')

    vi.useFakeTimers()
    try {
      await act(async () => {
        fireEvent.keyDown(window, { key: 'ArrowRight' })
        await vi.advanceTimersByTimeAsync(16)
      })
      const firstStep = character.getAttribute('style')
      const firstFrame = backgroundPosition(character)
      await act(() => vi.advanceTimersByTimeAsync(16))
      const secondStep = character.getAttribute('style')
      const secondFrame = backgroundPosition(character)
      await act(() => vi.advanceTimersByTimeAsync(80))
      const animatedFrame = backgroundPosition(character)
      await act(async () => {
        fireEvent.keyUp(window, { key: 'ArrowRight' })
      })
      const stoppedPosition = positionStyle(character)
      await act(() => vi.advanceTimersByTimeAsync(64))

      expect(character.getAttribute('data-direction')).toBe('right')
      expect(firstStep).not.toBe(start)
      expect(secondStep).not.toBe(firstStep)
      expect(secondFrame).toBe(firstFrame)
      expect(animatedFrame).not.toBe(firstFrame)
      expect(positionStyle(character)).toBe(stoppedPosition)
    } finally {
      vi.useRealTimers()
    }
  })

  it('closes the React lesson preview without entering the lesson', async () => {
    const { onSelectLesson } = setup()
    window.dispatchEvent(new Event('nextgen:open-map'))
    const lesson = await screen.findByRole('button', { name: 'เล่นด่าน ถ้ำแห่งความมืด' })
    vi.useFakeTimers()
    fireEvent.click(lesson)
    await vi.advanceTimersByTimeAsync(1000)
    vi.useRealTimers()
    fireEvent.click(screen.getByRole('button', { name: 'ปิดตัวอย่างบทเรียน' }))

    expect(screen.queryByRole('dialog', { name: 'ตัวอย่างบทเรียน' })).toBeNull()
    expect(onSelectLesson).not.toHaveBeenCalled()
  })

  // MMO-style "!" marker so the student can see which gate the teacher's quest
  // wants, instead of relying on the NPC dialogue they just closed.
  describe('teacher quest markers', () => {
    const withTargets = (lessonIds: string[]) => ({
      loadQuestTargets: vi.fn().mockResolvedValue({ success: true, data: lessonIds }),
    })

    it('marks only the lesson a quest is pointing at', async () => {
      setup(['L1'], withTargets(['L2']))
      window.dispatchEvent(new Event('nextgen:open-map'))

      expect(await screen.findByTestId('map-quest-marker-L2')).toBeTruthy()
      expect(screen.queryByTestId('map-quest-marker-L1')).toBeNull()
      expect(screen.queryByTestId('map-quest-marker-L3')).toBeNull()
    })

    it('marks every targeted lesson when several quests are running', async () => {
      setup(['L1'], withTargets(['L1', 'L3']))
      window.dispatchEvent(new Event('nextgen:open-map'))

      expect(await screen.findByTestId('map-quest-marker-L1')).toBeTruthy()
      expect(screen.getByTestId('map-quest-marker-L3')).toBeTruthy()
    })

    it('shows no markers when nothing is assigned', async () => {
      setup(['L1'], withTargets([]))
      window.dispatchEvent(new Event('nextgen:open-map'))

      await screen.findByTestId('adventure-map')
      await waitFor(() => expect(screen.queryByTestId('map-quest-marker-L2')).toBeNull())
    })

    it('still renders the map when the quest lookup fails', async () => {
      setup(['L1'], { loadQuestTargets: vi.fn().mockRejectedValue(new Error('offline')) })
      window.dispatchEvent(new Event('nextgen:open-map'))

      expect(await screen.findByTestId('adventure-map')).toBeTruthy()
      expect(screen.queryByTestId('map-quest-marker-L2')).toBeNull()
    })

    it('works when the host never supplies a quest lookup at all', async () => {
      setup(['L1'])
      window.dispatchEvent(new Event('nextgen:open-map'))

      expect(await screen.findByTestId('adventure-map')).toBeTruthy()
    })
  })

  // The same persistent tracker widget the hub shows, so the active teacher
  // quest stays visible while walking the map instead of disappearing.
  describe('teacher quest tracker', () => {
    const trackedQuestView = () => buildStudentQuestView(
      {
        questId: 'TQ001',
        lessonId: 'L2',
        lessonTitle: 'ถ้ำแห่งความมืด',
        title: 'ภารกิจ: ถ้ำแห่งความมืด',
        npcMessage: '',
        objectives: ['study'],
        classes: [],
        startAt: '',
        dueAt: '',
        status: 'active',
        rewards: EMPTY_QUEST_REWARDS,
      } satisfies TeacherQuest,
      { state: { acceptedAt: '2026-07-19' }, lessonPassed: false, worksheetSubmitted: false },
      '2026-07-19',
    )

    it('expands an in-place detail card on click instead of warping straight to the hub', async () => {
      const { onOpenNpc } = setup(['L1'], {
        loadQuestBoard: vi.fn().mockResolvedValue({ success: true, data: [trackedQuestView()] }),
      })
      window.dispatchEvent(new Event('nextgen:open-map'))

      const tracker = await screen.findByTestId('map-npc-tracker')
      expect(tracker.textContent).toContain('ภารกิจ: ถ้ำแห่งความมืด')

      // Clicking the tracker itself must never navigate away on its own.
      // Re-query after the async map/progress load so the click always targets
      // the currently mounted tracker rather than an element from a prior render.
      fireEvent.click(screen.getByTestId('map-npc-tracker'))
      expect(onOpenNpc).not.toHaveBeenCalled()
      const detail = await screen.findByTestId('map-npc-tracker-detail')

      // Only the explicit "go to the NPC" button inside the detail card does.
      fireEvent.click(within(detail).getByRole('button', { name: /ไปหาครูวีรภัทร์/ }))
      expect(onOpenNpc).toHaveBeenCalledTimes(1)
    })

    it('shows no tracker when nothing is tracked or the lookup fails', async () => {
      setup(['L1'], { loadQuestBoard: vi.fn().mockRejectedValue(new Error('offline')) })
      window.dispatchEvent(new Event('nextgen:open-map'))

      await screen.findByTestId('adventure-map')
      await waitFor(() => expect(screen.queryByTestId('map-npc-tracker')).toBeNull())
    })
  })

  it('shows a retryable error when Firestore loading fails', async () => {
    const service: MapService = {
      getCurrentUser: () => ({ id: 'user-1', avatar: '🧙', passedLessons: [] }),
      loadLessons: vi.fn().mockRejectedValue(new Error('offline')),
    }
    render(<AdventureMap service={service} onSelectLesson={vi.fn()} />)
    window.dispatchEvent(new Event('nextgen:open-map'))

    await waitFor(() => expect(screen.getByText('โหลดแผนที่ไม่สำเร็จ')).toBeTruthy())
    expect((screen.getByRole('button', { name: 'ลองใหม่' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
