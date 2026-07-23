// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TeacherQuestTracker } from './TeacherQuestTracker'
import { EMPTY_QUEST_REWARDS, buildStudentQuestView, normalizeQuestRewards, type TeacherQuest } from '../services/teacherQuestLogic'

const quest = (override: Partial<TeacherQuest> = {}): TeacherQuest => ({
  questId: 'TQ001',
  lessonId: 'L1',
  lessonTitle: 'ความปลอดภัยบนโลกออนไลน์',
  title: 'ภารกิจ: ความปลอดภัยบนโลกออนไลน์',
  npcMessage: '',
  objectives: ['study', 'worksheet'],
  classes: [],
  startAt: '',
  dueAt: '',
  status: 'active',
  rewards: EMPTY_QUEST_REWARDS,
  ...override,
})

const view = (override: Partial<TeacherQuest> = {}) => buildStudentQuestView(
  quest(override),
  { state: { acceptedAt: '2026-07-19' }, lessonPassed: false, worksheetSubmitted: false },
  '2026-07-19',
)

afterEach(cleanup)

describe('TeacherQuestTracker', () => {
  it('renders nothing when there is no tracked quest', () => {
    const { container } = render(<TeacherQuestTracker tracked={null} onClick={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  describe('hub variant (default)', () => {
    it('shows the title, objective checklist and hint, and calls onClick directly on click', () => {
      const onClick = vi.fn()
      render(<TeacherQuestTracker tracked={view()} onClick={onClick} />)

      const button = screen.getByTestId('npc-tracker')
      expect(button.textContent).toContain('ภารกิจ: ความปลอดภัยบนโลกออนไลน์')
      expect(button.textContent).toContain('ศึกษาบทเรียน')
      expect(button.textContent).toContain('ทำใบงานส่งครู')

      fireEvent.click(button)
      expect(onClick).toHaveBeenCalledTimes(1)
    })
  })

  // Map/lesson: clicking the chip must never jump straight to the hub (that
  // was the reported bug) — it only expands an in-place summary. Navigating
  // away is a separate, explicit action inside the expanded detail card.
  describe('map/lesson variants', () => {
    it('expands a detail card with rewards on click instead of firing onClick', () => {
      const rewards = normalizeQuestRewards({ xp: 50, coins: 20 })
      const onClick = vi.fn()
      render(<TeacherQuestTracker tracked={view({ rewards })} onClick={onClick} variant="map" testId="map-npc-tracker" />)

      const toggle = screen.getByTestId('map-npc-tracker')
      expect(screen.queryByTestId('map-npc-tracker-detail')).toBeNull()

      fireEvent.click(toggle)
      expect(onClick).not.toHaveBeenCalled()

      const detail = screen.getByTestId('map-npc-tracker-detail')
      expect(detail.textContent).toContain('50 XP')
      expect(detail.textContent).toContain('20')

      fireEvent.click(within(detail).getByRole('button', { name: /ไปหาครูวีรภัทร์/ }))
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('toggles the detail card closed on a second click', () => {
      render(<TeacherQuestTracker tracked={view()} onClick={vi.fn()} variant="lesson" testId="lesson-npc-tracker" />)

      const toggle = screen.getByTestId('lesson-npc-tracker')
      fireEvent.click(toggle)
      expect(screen.getByTestId('lesson-npc-tracker-detail')).toBeTruthy()

      fireEvent.click(toggle)
      expect(screen.queryByTestId('lesson-npc-tracker-detail')).toBeNull()
    })

    it('applies the on-lesson positioning class to the outer card for the lesson variant', () => {
      render(<TeacherQuestTracker tracked={view()} onClick={vi.fn()} variant="lesson" testId="lesson-npc-tracker" />)

      const toggle = screen.getByTestId('lesson-npc-tracker')
      const card = toggle.closest('.teacher-quest-tracker')
      expect(card).toBeTruthy()
      expect(card?.className).toContain('on-lesson')
    })

    it('does not add the on-lesson class for the map variant', () => {
      render(<TeacherQuestTracker tracked={view()} onClick={vi.fn()} variant="map" testId="map-npc-tracker" />)

      const card = screen.getByTestId('map-npc-tracker').closest('.teacher-quest-tracker')
      expect(card?.className).not.toContain('on-lesson')
    })
  })
})
