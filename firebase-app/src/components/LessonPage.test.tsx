// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LessonPage, type Lesson, type LessonService } from './LessonPage'
import type { QuizQuestion } from './QuizQuestionView'
import { toLessonEmbedUrl } from './lessonMedia'
import { LESSON_MONSTER_KILL_TARGET } from './lessonAdventureLogic'
import * as gameAudio from '../services/gameAudio'
import { EMPTY_QUEST_REWARDS, buildStudentQuestView, type TeacherQuest } from '../services/teacherQuestLogic'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  cleanup()
})

const lesson = {
  id: 'lesson-1',
  title: 'ป่าแห่งเศษส่วน',
  description: 'เรียนรู้ก่อนเผชิญหน้าบอส',
  content: 'บรรทัดแรก\nบรรทัดที่สอง',
  videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12',
}

const bossQuestions: QuizQuestion[] = [
  { qId: 'boss-q1', text: 'Boss question one', options: ['Wrong boss 1', 'Correct boss 1', 'Wrong boss 3', 'Wrong boss 4'], answer: 1, pattern: 'choice' },
  { qId: 'boss-q2', text: 'Boss question two', options: ['Correct boss 2', 'Wrong boss 2'], answer: 0, pattern: 'choice' },
]

function setup(
  currentLesson: Lesson | null = lesson,
  options: { random?: () => number; videoUnlockMs?: number; questions?: QuizQuestion[] } = {},
  serviceOverride: Partial<LessonService> = {},
) {
  const service: LessonService = {
    getCurrentLesson: vi.fn(() => currentLesson),
    getCurrentUser: vi.fn(() => ({ id: 'u1', avatar: '🧙', xp: 100, coins: 20, level: 2, rank: 'BRONZE', passedLessons: [] })),
    getTimerPerQuestion: vi.fn(() => 30),
    loadQuestions: vi.fn().mockResolvedValue({ success: true, data: options.questions || bossQuestions }),
    saveProgress: vi.fn().mockResolvedValue({ success: true, stats: { xp: 110, coins: 25, level: 2, rank: 'BRONZE', gainedXp: 10, alreadyPassed: false } }),
    saveAdventureRewards: vi.fn().mockResolvedValue({ success: true, stats: { xp: 150, coins: 40, level: 2, rank: 'BRONZE', gainedXp: 50, gainedCoins: 20 } }),
    trackDailyProgress: vi.fn(),
    ...serviceOverride,
  }
  const onBack = vi.fn()
  const onStartQuiz = vi.fn()
  const onOpenWorksheet = vi.fn()
  const onExitGame = vi.fn()
  const onOpenNpc = vi.fn()
  render(<LessonPage service={service} onBack={onBack} onStartQuiz={onStartQuiz} onOpenWorksheet={onOpenWorksheet} onExitGame={onExitGame} onOpenNpc={onOpenNpc} {...options} />)
  return { service, onBack, onStartQuiz, onOpenWorksheet, onExitGame, onOpenNpc }
}

function mockFullWorldRect(world: HTMLElement) {
  vi.spyOn(world, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 1000, height: 1000, x: 0, y: 0, right: 1000, bottom: 1000, toJSON: () => ({}),
  })
}

// Fake timers must be installed before the lesson opens, otherwise the monster combat-tick
// interval is created against the real clock and advanceTimersByTimeAsync never reaches it.
function openLessonWithFakeTimers(options: { random?: () => number; videoUnlockMs?: number } = {}) {
  const handlers = setup(lesson, options)
  vi.useFakeTimers()
  act(() => { window.dispatchEvent(new Event('nextgen:open-lesson')) })
  const world = screen.getByTestId('lesson-adventure-world')
  const player = screen.getByTestId('lesson-player')
  mockFullWorldRect(world)
  return { ...handlers, world, player }
}

function defeatFirstMonster() {
  const attack = screen.getByRole('button', { name: 'โจมตีด้วยดาบ' })
  fireEvent.click(attack)
  fireEvent.click(attack)
  fireEvent.click(attack)
}

// Quest card defaults to a compact glance summary (icon + title + hint); the full detail panel
// (heading, objectives, completion banner) only renders once expanded.
function openQuestCard() {
  fireEvent.click(screen.getByRole('button', { name: 'ขยายหน้าต่างเควส' }))
}

async function letMonsterKillPlayer(world: HTMLElement) {
  // Monster 1 spawns at (21%, 61%); standing on top of it keeps the player inside melee range
  // so the 100ms combat tick's windup -> strike -> cooldown cycle repeats until HP hits zero.
  fireEvent.mouseDown(world, { clientX: 210, clientY: 610, button: 0 })
  await act(() => vi.advanceTimersByTimeAsync(30000))
}

function positionStyle(node: HTMLElement) {
  const style = node.getAttribute('style') || ''
  return style.match(/left:[^;]+; top:[^;]+;/)?.[0] || style
}

function backgroundPosition(node: HTMLElement) {
  const style = node.getAttribute('style') || ''
  return style.match(/background-position:[^;]+;/)?.[0] || ''
}

// Zone portals now require the 20-kill quest in addition to the note/video quest, so tests that
// need to reach zone 2 or 3 must grind kills through the respawn cycle (8600ms). This requires
// fake timers to already be active (installed before the lesson opens, see openLessonWithFakeTimers)
// so the respawn interval advances with vi.advanceTimersByTimeAsync instead of the real clock.
async function grindMonsterKills(count: number) {
  const attack = screen.getByRole('button', { name: 'โจมตีด้วยดาบ' })
  // If the nearest monster is already a corpse from an earlier attack (e.g. the note-drop
  // kill), wait for its respawn before grinding so the first swing below lands on something alive.
  const firstMonster = document.querySelector('[aria-label^="โจมตีมอนสเตอร์"]')
  if (firstMonster?.getAttribute('data-mode') === 'dead') {
    await act(() => vi.advanceTimersByTimeAsync(8110))
  }
  for (let i = 0; i < count; i += 1) {
    fireEvent.click(attack)
    fireEvent.click(attack)
    fireEvent.click(attack)
    if (i < count - 1) await act(() => vi.advanceTimersByTimeAsync(8110))
  }
}

async function enterZone2() {
  screen.getByRole('button', { name: /โจมตีมอนสเตอร์ 1/ })
  await grindMonsterKills(LESSON_MONSTER_KILL_TARGET)
  fireEvent.click(screen.getByRole('button', { name: /เปิดโน้ตบทเรียน/ }))
  fireEvent.click(screen.getByRole('button', { name: /อ่านจบแล้ว/ }))
  fireEvent.click(screen.getByRole('button', { name: /วาร์ปไปแมพ 2/ }))
}

async function enterBossRoom() {
  await enterZone2()
  await grindMonsterKills(LESSON_MONSTER_KILL_TARGET)
  fireEvent.click(screen.getByRole('button', { name: /เปิดตู้วิดีโอลับ/ }))
  fireEvent.click(screen.getByRole('button', { name: /ยืนยันว่าดูวิดีโอจบแล้ว/ }))
  fireEvent.click(screen.getByRole('button', { name: /วาร์ปไปแมพ 3/ }))
}

describe('LessonPage', () => {
  it('selects monster music for the opening zones and plays the sword effect on every attack input', async () => {
    const setMusic = vi.spyOn(gameAudio, 'setLessonMusic')
    const playSword = vi.spyOn(gameAudio, 'playSwordHit')
    setup()
    window.dispatchEvent(new Event('nextgen:open-lesson'))

    await screen.findByTestId('lesson-adventure-world')
    fireEvent.click(screen.getByRole('button', { name: 'โจมตีด้วยดาบ' }))

    expect(setMusic).toHaveBeenCalledWith(1)
    expect(playSword).toHaveBeenCalledOnce()
  })

  it('opens as a three-zone explorable RPG lesson world', async () => {
    setup()
    window.dispatchEvent(new Event('nextgen:open-lesson'))

    expect(await screen.findByTestId('lesson-adventure-world')).toBeTruthy()
    openQuestCard()
    expect(screen.getByRole('heading', { name: 'เควส 1: ตามหาโน้ตความรู้' })).toBeTruthy()
    expect(screen.getByTestId('lesson-player')).toBeTruthy()
  })

  it('drops a note, requires reading it, and then unlocks the first portal', async () => {
    openLessonWithFakeTimers({ random: () => 0 })
    try {
      openQuestCard()
      const attack = screen.getByRole('button', { name: 'โจมตีด้วยดาบ' })
      fireEvent.click(attack)
      expect(screen.getByText('55/100')).toBeTruthy()
      fireEvent.click(attack)
      expect(screen.getByText('10/100')).toBeTruthy()
      fireEvent.click(attack)
      fireEvent.click(screen.getByRole('button', { name: 'เปิดโน้ตบทเรียน' }))
      expect(screen.getByRole('dialog', { name: 'โน้ตเนื้อหาบทเรียน' })).toBeTruthy()
      expect(screen.getByText(/บรรทัดแรก/).textContent).toContain('บรรทัดที่สอง')
      expect(screen.queryByRole('button', { name: 'วาร์ปไปแมพ 2' })).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'อ่านจบแล้ว' }))
      expect(screen.queryByRole('button', { name: 'วาร์ปไปแมพ 2' })).toBeNull()
      expect(screen.getByTestId('lesson-quest-objectives').textContent).toContain('โจมตีมอนสเตอร์ (1/20)')

      await grindMonsterKills(LESSON_MONSTER_KILL_TARGET - 1)
      expect(screen.getByTestId('lesson-quest-objectives').textContent).toContain(`โจมตีมอนสเตอร์ (${LESSON_MONSTER_KILL_TARGET}/${LESSON_MONSTER_KILL_TARGET})`)
      fireEvent.click(screen.getByRole('button', { name: 'วาร์ปไปแมพ 2' }))
      expect(screen.getByRole('heading', { name: 'เควส 2: ค้นหาตู้วิดีโอลับ' })).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('highlights an available worksheet inside the lesson note and opens it directly', async () => {
    const handlers = setup(
      { ...lesson, worksheetUrl: 'https://docs.google.com/presentation/d/worksheet/edit' },
      { random: () => 0 },
    )
    window.dispatchEvent(new Event('nextgen:open-lesson'))
    expect(await screen.findByTestId('lesson-adventure-world')).toBeTruthy()
    defeatFirstMonster()
    fireEvent.click(await screen.findByRole('button', { name: /เปิดโน้ตบทเรียน/ }))

    expect(screen.getByTestId('lesson-note-header')).toBeTruthy()
    expect(screen.getByTestId('lesson-note-worksheet-badge').textContent).toContain('บทนี้มีใบงาน')
    fireEvent.click(screen.getByRole('button', { name: 'ทำใบงานบทนี้' }))
    expect(handlers.onOpenWorksheet).toHaveBeenCalledOnce()
  })

  it('allows manual video confirmation when the provider does not report completion', async () => {
    openLessonWithFakeTimers({ random: () => 0, videoUnlockMs: 100 })
    try {
      openQuestCard()
      defeatFirstMonster()
      fireEvent.click(screen.getByRole('button', { name: 'เปิดโน้ตบทเรียน' }))
      fireEvent.click(screen.getByRole('button', { name: 'อ่านจบแล้ว' }))
      await grindMonsterKills(LESSON_MONSTER_KILL_TARGET - 1)
      fireEvent.click(screen.getByRole('button', { name: 'วาร์ปไปแมพ 2' }))

      fireEvent.click(screen.getByRole('button', { name: 'เปิดตู้วิดีโอลับ' }))
      const complete = screen.getByRole('button', { name: 'ยืนยันว่าดูวิดีโอจบแล้ว' }) as HTMLButtonElement
      expect(complete.disabled).toBe(false)
      fireEvent.click(complete)
      await grindMonsterKills(LESSON_MONSTER_KILL_TARGET)
      fireEvent.click(screen.getByRole('button', { name: 'วาร์ปไปแมพ 3' }))
      expect(screen.getByRole('heading', { name: 'เควส 3: ปราบผู้พิทักษ์บทเรียน' })).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  // A lesson the admin never gave a video link to must not spawn the video
  // quest — the cabinet would only open an empty player the student still has
  // to confirm.
  it('drops the zone 2 video quest entirely when the lesson has no video link', async () => {
    const noVideo = { ...lesson, videoUrl: '' }
    setup(noVideo, { random: () => 0 })
    vi.useFakeTimers()
    try {
      act(() => { window.dispatchEvent(new Event('nextgen:open-lesson')) })
      defeatFirstMonster()
      fireEvent.click(screen.getByRole('button', { name: 'เปิดโน้ตบทเรียน' }))
      fireEvent.click(screen.getByRole('button', { name: 'อ่านจบแล้ว' }))
      await grindMonsterKills(LESSON_MONSTER_KILL_TARGET - 1)
      fireEvent.click(screen.getByRole('button', { name: 'วาร์ปไปแมพ 2' }))

      // No cabinet to open, and the checklist carries the kill quest only.
      expect(screen.queryByRole('button', { name: 'เปิดตู้วิดีโอลับ' })).toBeNull()
      openQuestCard()
      expect(screen.queryByText(/ตู้วิดีโอลับ/)).toBeNull()

      // Kills alone open the boss portal.
      await grindMonsterKills(LESSON_MONSTER_KILL_TARGET)
      fireEvent.click(screen.getByRole('button', { name: 'วาร์ปไปแมพ 3' }))
      expect(screen.getByRole('heading', { name: 'เควส 3: ปราบผู้พิทักษ์บทเรียน' })).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses a direct-media ended event to show verified completion without blocking the manual button', async () => {
    setup({ ...lesson, videoUrl: 'https://cdn.test/lesson.mp4' }, { random: () => 0 })
    vi.useFakeTimers()
    try {
      act(() => { window.dispatchEvent(new Event('nextgen:open-lesson')) })
      defeatFirstMonster()
      fireEvent.click(screen.getByRole('button', { name: 'เปิดโน้ตบทเรียน' }))
      fireEvent.click(screen.getByRole('button', { name: 'อ่านจบแล้ว' }))
      await grindMonsterKills(LESSON_MONSTER_KILL_TARGET - 1)
      fireEvent.click(screen.getByRole('button', { name: 'วาร์ปไปแมพ 2' }))
      fireEvent.click(screen.getByRole('button', { name: 'เปิดตู้วิดีโอลับ' }))
      const complete = screen.getByRole('button', { name: 'ยืนยันว่าดูวิดีโอจบแล้ว' }) as HTMLButtonElement

      expect(complete.disabled).toBe(false)
      expect(screen.getByText(/รับชมวิดีโอให้จบ/)).toBeTruthy()
      fireEvent.ended(screen.getByLabelText('วิดีโอบทเรียนป่าแห่งเศษส่วน'))
      expect(screen.getByText(/ตรวจสอบการรับชมแล้ว/)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('walks smoothly while a keyboard direction is held and keeps the boss fight inside zone three', async () => {
    const handlers = setup(lesson, { random: () => 0, videoUnlockMs: 0 })
    window.dispatchEvent(new Event('nextgen:open-lesson'))
    const player = await screen.findByTestId('lesson-player')
    const start = player.getAttribute('style')
    vi.useFakeTimers()
    try {
      fireEvent.keyDown(window, { key: 'ArrowRight' })
      await vi.advanceTimersByTimeAsync(16)
      const firstStep = player.getAttribute('style')
      const firstFrame = backgroundPosition(player)
      await vi.advanceTimersByTimeAsync(16)
      const secondStep = player.getAttribute('style')
      const secondFrame = backgroundPosition(player)
      await vi.advanceTimersByTimeAsync(80)
      const animatedFrame = backgroundPosition(player)
      fireEvent.keyUp(window, { key: 'ArrowRight' })
      const stoppedPosition = positionStyle(player)
      await vi.advanceTimersByTimeAsync(64)

      expect(player.getAttribute('data-direction')).toBe('right')
      expect(firstStep).not.toBe(start)
      expect(firstStep).toContain('transition-duration: 0ms')
      expect(secondStep).not.toBe(firstStep)
      expect(secondFrame).toBe(firstFrame)
      expect(animatedFrame).not.toBe(firstFrame)
      expect(positionStyle(player)).toBe(stoppedPosition)
    } finally {
      vi.useRealTimers()
    }
    expect(player.getAttribute('data-direction')).toBe('right')

    vi.useFakeTimers()
    try {
      defeatFirstMonster()
      fireEvent.click(screen.getByRole('button', { name: 'เปิดโน้ตบทเรียน' }))
      fireEvent.click(screen.getByRole('button', { name: 'อ่านจบแล้ว' }))
      await grindMonsterKills(LESSON_MONSTER_KILL_TARGET - 1)
      fireEvent.click(screen.getByRole('button', { name: 'วาร์ปไปแมพ 2' }))
      fireEvent.click(screen.getByRole('button', { name: 'เปิดตู้วิดีโอลับ' }))
      fireEvent.click(screen.getByRole('button', { name: 'ยืนยันว่าดูวิดีโอจบแล้ว' }))
      await grindMonsterKills(LESSON_MONSTER_KILL_TARGET)
      fireEvent.click(screen.getByRole('button', { name: 'วาร์ปไปแมพ 3' }))
    } finally {
      vi.useRealTimers()
    }
    fireEvent.click(screen.getByRole('button', { name: 'ท้าทายบอสบทเรียน' }))
    const bossSpriteStyle = screen.getByTestId('lesson-boss-sprite').getAttribute('style') || ''
    expect(bossSpriteStyle).toContain('display: block')
    expect(bossSpriteStyle).toContain('background-size: 5760px 21600px')
    expect(bossSpriteStyle).toContain('background-position: 0px -2400px')
    expect(handlers.onStartQuiz).not.toHaveBeenCalled()
    expect(handlers.service.loadQuestions).toHaveBeenCalledWith('lesson-1')
    await waitFor(() => expect(screen.getByTestId('lesson-boss-encounter').getAttribute('data-state')).toBe('skirmish'))
    expect(await screen.findByTestId('lesson-boss-hud')).toBeTruthy()
  })

  it('asks boss questions only after repeated manual hits in the same boss room', async () => {
    const handlers = setup(lesson, { random: () => 0, videoUnlockMs: 0 })
    vi.useFakeTimers()
    try {
      act(() => { window.dispatchEvent(new Event('nextgen:open-lesson')) })
      await enterBossRoom()
    } finally {
      vi.useRealTimers()
    }

    const world = screen.getByTestId('lesson-adventure-world')
    const player = screen.getByTestId('lesson-player')
    vi.spyOn(world, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 1000,
      x: 0,
      y: 0,
      right: 1000,
      bottom: 1000,
      toJSON: () => ({}),
    })

    fireEvent.click(screen.getByTestId('lesson-boss-challenge'))
    await waitFor(() => expect(screen.getByTestId('lesson-boss-attack-button')).toBeTruthy())
    // This test exercises manual timing; boss rooms now default to auto mode,
    // so opt out explicitly before counting the three manual sword hits.
    const bossAutoButton = screen.getByRole('button', { name: 'สลับโหมดโจมตีอัตโนมัติ' })
    expect(bossAutoButton.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(bossAutoButton)
    expect(handlers.onStartQuiz).not.toHaveBeenCalled()

    vi.useFakeTimers()
    try {
      fireEvent.mouseDown(world, { clientX: 500, clientY: 430, button: 0 })
      await act(() => vi.advanceTimersByTimeAsync(3200))
      expect(positionStyle(player)).toContain('left: 50%; top: 43%;')

      const attack = screen.getByTestId('lesson-boss-attack-button')
      await act(async () => {
        fireEvent.click(attack)
      })
      expect(screen.queryByText('Boss question one')).toBeNull()
      await act(async () => {
        fireEvent.click(attack)
      })
      expect(screen.queryByText('Boss question one')).toBeNull()
      await act(async () => {
        fireEvent.click(attack)
      })

      expect(screen.getByTestId('lesson-boss-question-panel')).toBeTruthy()
      expect(screen.getByText('Boss question one')).toBeTruthy()
      expect(within(screen.getByTestId('lesson-boss-question-panel')).getByTestId('boss-quiz-choices').children).toHaveLength(4)
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Correct boss 1/ }))
      })
      expect(screen.queryByTestId('lesson-boss-question-panel')).toBeNull()

      await act(async () => {
        fireEvent.click(screen.getByTestId('lesson-boss-attack-button'))
      })
      expect(screen.queryByText('Boss question two')).toBeNull()
      await act(async () => {
        fireEvent.click(screen.getByTestId('lesson-boss-attack-button'))
        fireEvent.click(screen.getByTestId('lesson-boss-attack-button'))
      })

      expect(screen.getByTestId('lesson-boss-question-panel')).toBeTruthy()
      expect(screen.getByText('Boss question two')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps auto battle off in monster maps and enables it by default on entering the boss map', async () => {
    setup(lesson, { random: () => 0, videoUnlockMs: 0 })
    vi.useFakeTimers()
    try {
      act(() => { window.dispatchEvent(new Event('nextgen:open-lesson')) })
      const fieldAutoButton = screen.getByRole('button', { name: 'สลับโหมดโจมตีอัตโนมัติ' })
      expect(fieldAutoButton.getAttribute('aria-pressed')).toBe('false')

      await enterBossRoom()
      fireEvent.click(screen.getByRole('button', { name: 'ท้าทายบอสบทเรียน' }))
      await act(() => vi.advanceTimersByTimeAsync(0))

      expect(screen.getByRole('button', { name: 'สลับโหมดโจมตีอัตโนมัติ' }).getAttribute('aria-pressed')).toBe('true')
      expect(screen.getByText('AUTO')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows a level-up notice on the boss result panel when the fight raises the hero level', async () => {
    const service: LessonService = {
      getCurrentLesson: vi.fn(() => lesson),
      getCurrentUser: vi.fn(() => ({ id: 'u1', avatar: '🧙', xp: 90, coins: 20, level: 2, rank: 'BRONZE', passedLessons: [] })),
      getTimerPerQuestion: vi.fn(() => 30),
      loadQuestions: vi.fn().mockResolvedValue({ success: true, data: bossQuestions }),
      saveProgress: vi.fn().mockResolvedValue({ success: true, stats: { xp: 110, coins: 25, level: 3, rank: 'BRONZE', gainedXp: 20, alreadyPassed: false } }),
      trackDailyProgress: vi.fn(),
    }
    render(<LessonPage service={service} onBack={vi.fn()} onStartQuiz={vi.fn()} onOpenWorksheet={vi.fn()} random={() => 0} videoUnlockMs={0} />)
    vi.useFakeTimers()
    try {
      act(() => { window.dispatchEvent(new Event('nextgen:open-lesson')) })
      await enterBossRoom()
    } finally {
      vi.useRealTimers()
    }

    const world = screen.getByTestId('lesson-adventure-world')
    vi.spyOn(world, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 1000, height: 1000, x: 0, y: 0, right: 1000, bottom: 1000, toJSON: () => ({}),
    })
    fireEvent.click(screen.getByTestId('lesson-boss-challenge'))
    await waitFor(() => expect(screen.getByTestId('lesson-boss-attack-button')).toBeTruthy())
    // This case verifies the manual level-up/result flow. Zone 3 intentionally
    // enables AUTO by default, so turn it off explicitly before the timed walk
    // or the smoother auto driver may legitimately open the question first.
    const autoToggle = screen.getByRole('button', { name: 'สลับโหมดโจมตีอัตโนมัติ' })
    expect(autoToggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(autoToggle)

    vi.useFakeTimers()
    try {
      fireEvent.mouseDown(world, { clientX: 500, clientY: 430, button: 0 })
      await act(() => vi.advanceTimersByTimeAsync(3200))

      const attack = screen.getByTestId('lesson-boss-attack-button')
      for (let hit = 0; hit < 3; hit += 1) {
        await act(async () => { fireEvent.click(attack) })
      }
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Correct boss 1/ })) })
      for (let hit = 0; hit < 3; hit += 1) {
        await act(async () => { fireEvent.click(screen.getByTestId('lesson-boss-attack-button')) })
      }
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Correct boss 2/ })) })

      expect(screen.getByTestId('lesson-boss-result-panel')).toBeTruthy()
      expect(screen.getByText(/LEVEL UP! เลเวล 3/)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('walks toward a clicked floor target instead of warping there instantly', async () => {
    setup(lesson, { random: () => 0 })
    window.dispatchEvent(new Event('nextgen:open-lesson'))
    const world = await screen.findByTestId('lesson-adventure-world')
    const player = screen.getByTestId('lesson-player')
    vi.spyOn(world, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 1000,
      x: 0,
      y: 0,
      right: 1000,
      bottom: 1000,
      toJSON: () => ({}),
    })
    vi.useFakeTimers()

    try {
      fireEvent.mouseDown(world, { clientX: 750, clientY: 700, button: 0 })
      const afterClick = positionStyle(player)

      expect(player.getAttribute('data-action')).toBe('walk')
      expect(afterClick).not.toContain('left: 75%; top: 70%;')
      await act(() => vi.advanceTimersByTimeAsync(160))
      expect(positionStyle(player)).not.toBe(afterClick)
      await act(() => vi.advanceTimersByTimeAsync(4800))
      expect(positionStyle(player)).toContain('left: 75%; top: 70%;')
      expect(player.getAttribute('data-action')).toBe('idle')
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses the sword slash rows from the character spritesheet during player attacks', async () => {
    setup(lesson, { random: () => 0 })
    window.dispatchEvent(new Event('nextgen:open-lesson'))
    const player = await screen.findByTestId('lesson-player')
    vi.useFakeTimers()

    try {
      fireEvent.click(screen.getByRole('button', { name: 'โจมตีด้วยดาบ' }))
      const firstSlash = backgroundPosition(player)
      expect(screen.getByTestId('lesson-slash-effect')).toBeTruthy()
      await act(() => vi.advanceTimersByTimeAsync(90))
      const secondSlash = backgroundPosition(player)

      expect(player.getAttribute('data-action')).toBe('attack')
      expect(firstSlash).toContain('background-position: -104px -6656px')
      expect(secondSlash).not.toBe(firstSlash)
      await act(() => vi.advanceTimersByTimeAsync(500))
      expect(player.getAttribute('data-action')).toBe('idle')
      expect(screen.queryByTestId('lesson-slash-effect')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('still plays a sword slash when no monster is in attack range', async () => {
    setup(lesson, { random: () => 0 })
    window.dispatchEvent(new Event('nextgen:open-lesson'))
    const player = await screen.findByTestId('lesson-player')
    vi.useFakeTimers()

    try {
      const attack = screen.getByRole('button', { name: 'โจมตีด้วยดาบ' })
      fireEvent.click(attack)
      fireEvent.click(attack)
      fireEvent.click(attack)
      await act(() => vi.advanceTimersByTimeAsync(540))
      fireEvent.click(attack)

      expect(player.getAttribute('data-action')).toBe('attack')
      expect(screen.getByTestId('lesson-slash-effect')).toBeTruthy()
      expect(screen.getByText('ไม่มีมอนสเตอร์อยู่ในระยะโจมตี')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the Ragnarok-style HUD with SP bar, minimap, and hero level', async () => {
    setup()
    window.dispatchEvent(new Event('nextgen:open-lesson'))

    expect(await screen.findByTestId('lesson-status-hud')).toBeTruthy()
    expect(screen.getByText('SP 100/100')).toBeTruthy()
    expect(screen.getByText(/ATK 45/)).toBeTruthy()
    expect(screen.getByText('Lv.2 ผู้กล้า')).toBeTruthy()
    expect(screen.getByTestId('lesson-minimap')).toBeTruthy()
    expect(screen.getByTestId('lesson-hotbar')).toBeTruthy()
    expect(screen.getAllByText(/Lv\.2 ผู้พิทักษ์เงา/)).toHaveLength(3)
  })

  it('grants monster XP with a combo bonus, shows an EXP float, and fills the HUD XP bar', async () => {
    openLessonWithFakeTimers({ random: () => 0 })
    try {
      // User starts at 100 XP (level 2). Shadow keeper pays 15 base XP; the third
      // combo hit lands the kill so the reward is 15 * 1.2 = 18 XP → 118 total.
      expect(screen.getByText('EXP 20/100')).toBeTruthy()
      defeatFirstMonster()
      expect(screen.getByText('+18 EXP')).toBeTruthy()
      expect(screen.getByText('EXP 38/100')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('levels up with a celebration burst and a full heal once kill XP crosses the threshold', async () => {
    const { service } = openLessonWithFakeTimers({ random: () => 0 })
    try {
      // 5 kills x 18 XP = 90 XP -> 190 total, crossing the 180 XP needed for level 3.
      await grindMonsterKills(5)
      expect(screen.getByTestId('lesson-level-up')).toBeTruthy()
      expect(screen.getByText('Lv.3 ผู้กล้า')).toBeTruthy()
      expect(screen.getByText('HP 100/100')).toBeTruthy()
      // The new level must stick outside the map: leveling up persists immediately.
      // Coins: the tutorial monster now dies inside the auto-pickup radius, so
      // the kills bank their 3-coin drops (random()=0) automatically. Only 4 of
      // the 5 drops are in the bank at assert time — the 5th kill levels up and
      // flushes immediately, before the next 100ms world tick can collect it.
      expect(service.saveAdventureRewards).toHaveBeenCalledWith('u1', 90, 12)
    } finally {
      vi.useRealTimers()
    }
  })

  it('flushes unsaved session XP to the rewards service when retreating to the map', async () => {
    const { service, onBack } = openLessonWithFakeTimers({ random: () => 0 })
    try {
      defeatFirstMonster()
      fireEvent.click(screen.getByRole('button', { name: 'ถอยทัพกลับแผนที่' }))
      expect(service.saveAdventureRewards).toHaveBeenCalledWith('u1', 18, 0)
      expect(onBack).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('opens the shared hero profile overlay from the HUD portrait, banks XP, and resumes on close', async () => {
    const { service } = setup()
    window.dispatchEvent(new Event('nextgen:open-lesson'))
    await screen.findByTestId('lesson-status-hud')

    let profileOpened = 0
    const seen = () => { profileOpened += 1 }
    window.addEventListener('nextgen:open-hero-profile', seen)
    try {
      fireEvent.click(screen.getByRole('button', { name: 'เปิดโปรไฟล์ตัวละคร' }))
      // Requests the one global HeroProfile window (not a lesson-local panel)
      // and flushes any unsaved XP so server-side stat allocation sees it.
      expect(profileOpened).toBe(1)
      expect(service.saveAdventureRewards).not.toHaveBeenCalled() // nothing unsaved yet -> skipped
      // Closing the shared overlay resumes the run without errors.
      act(() => { window.dispatchEvent(new Event('nextgen:hero-profile-closed')) })
      expect(screen.getByTestId('lesson-status-hud')).toBeTruthy()
    } finally {
      window.removeEventListener('nextgen:open-hero-profile', seen)
    }
  })

  it('announces quest completion and shows a guide arrow toward the portal once a zone is cleared', async () => {
    openLessonWithFakeTimers({ random: () => 0 })
    try {
      openQuestCard()
      expect(screen.queryByTestId('lesson-quest-complete')).toBeNull()
      expect(screen.queryByTestId('lesson-portal-guide')).toBeNull()

      await grindMonsterKills(LESSON_MONSTER_KILL_TARGET)
      fireEvent.click(screen.getByRole('button', { name: /เปิดโน้ตบทเรียน/ }))
      fireEvent.click(screen.getByRole('button', { name: /อ่านจบแล้ว/ }))

      expect(screen.getByTestId('lesson-quest-complete').textContent).toContain('เควสสำเร็จ')
      const guide = screen.getByTestId('lesson-portal-guide')
      expect(guide.getAttribute('style')).toContain('rotate(')
    } finally {
      vi.useRealTimers()
    }
  })

  it('pauses and hides the adventure while the worksheet is open, then resumes without resetting', async () => {
    openLessonWithFakeTimers({ random: () => 0 })
    try {
      openQuestCard()
      defeatFirstMonster()
      expect(screen.getByText(/โจมตีมอนสเตอร์ \(1\/20\)/)).toBeTruthy()
      const autoBattle = screen.getByRole('button', { name: 'สลับโหมดโจมตีอัตโนมัติ' })
      fireEvent.click(autoBattle)
      expect(autoBattle.getAttribute('aria-pressed')).toBe('true')

      act(() => { window.dispatchEvent(new Event('nextgen:open-worksheet')) })
      const page = document.getElementById('page-lesson') as HTMLElement
      expect(page.style.display).toBe('none')

      act(() => { window.dispatchEvent(new Event('nextgen:open-lesson')) })
      expect(page.style.display).toBe('block')
      expect(autoBattle.getAttribute('aria-pressed')).toBe('true')
      expect(screen.getByText(/โจมตีมอนสเตอร์ \(1\/20\)/)).toBeTruthy()
      expect(screen.getByText('EXP 38/100')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows compact objective counters on the collapsed quest card without expanding', async () => {
    openLessonWithFakeTimers({ random: () => 0 })
    try {
      // Collapsed card: no "tap for details" filler — the actual progress shows.
      expect(screen.getByText('โจมตีมอนสเตอร์ (0/20), โน้ตความรู้ (0/1)')).toBeTruthy()
      defeatFirstMonster()
      expect(screen.getByText('โจมตีมอนสเตอร์ (1/20), โน้ตความรู้ (0/1)')).toBeTruthy()
      expect(screen.queryByText('แตะเพื่อดูรายละเอียดภารกิจ')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('starts a fresh run when a different lesson opens after a stale worksheet pause', async () => {
    const secondLesson: Lesson = { ...lesson, id: 'lesson-2', title: 'ถ้ำสายฟ้า' }
    let currentLesson: Lesson = lesson
    const service: LessonService = {
      getCurrentLesson: vi.fn(() => currentLesson),
      getCurrentUser: vi.fn(() => ({ id: 'u1', avatar: '🧙', xp: 100, coins: 20, level: 2, rank: 'BRONZE', passedLessons: [] })),
      getTimerPerQuestion: vi.fn(() => 30),
      loadQuestions: vi.fn().mockResolvedValue({ success: true, data: bossQuestions }),
      saveProgress: vi.fn().mockResolvedValue({ success: true, stats: { xp: 110, coins: 25, level: 2, rank: 'BRONZE', gainedXp: 10, alreadyPassed: false } }),
      saveAdventureRewards: vi.fn().mockResolvedValue({ success: true, stats: { xp: 150, coins: 40, level: 2, rank: 'BRONZE', gainedXp: 50, gainedCoins: 20 } }),
      trackDailyProgress: vi.fn(),
    }
    render(<LessonPage service={service} onBack={vi.fn()} onStartQuiz={vi.fn()} onOpenWorksheet={vi.fn()} random={() => 0} />)
    vi.useFakeTimers()
    try {
      act(() => { window.dispatchEvent(new Event('nextgen:open-lesson')) })
      mockFullWorldRect(screen.getByTestId('lesson-adventure-world'))
      openQuestCard()
      defeatFirstMonster()
      expect(screen.getByText(/โจมตีมอนสเตอร์ \(1\/20\)/)).toBeTruthy()

      // The worksheet pause is left dangling (the player never came back to
      // this lesson) — opening a DIFFERENT lesson must never resume the old run.
      act(() => { window.dispatchEvent(new Event('nextgen:open-worksheet')) })
      currentLesson = secondLesson
      act(() => { window.dispatchEvent(new Event('nextgen:open-lesson')) })

      const page = document.getElementById('page-lesson') as HTMLElement
      expect(page.style.display).toBe('block')
      expect(screen.getByText(/โจมตีมอนสเตอร์ \(0\/20\)/)).toBeTruthy()
      expect(screen.queryByTestId('lesson-boss-result-panel')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('never resumes a finished run: leaving via the boss result clears the pause marker', async () => {
    const { onBack } = openLessonWithFakeTimers({ random: () => 0 })
    try {
      // Simulate a stray worksheet event racing the exit (legacy nav quirk).
      act(() => { window.dispatchEvent(new Event('nextgen:open-worksheet')) })
      act(() => { window.dispatchEvent(new Event('nextgen:open-lesson')) })
      openQuestCard()
      defeatFirstMonster()
      expect(screen.getByText(/โจมตีมอนสเตอร์ \(1\/20\)/)).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: 'ถอยทัพกลับแผนที่' }))
      expect(onBack).toHaveBeenCalled()

      // Re-entering the same lesson after leaving starts from scratch.
      act(() => { window.dispatchEvent(new Event('nextgen:open-lesson')) })
      expect(screen.getByText(/โจมตีมอนสเตอร์ \(0\/20\)/)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('populates zone 1 with SVG field monsters alongside the original shadow keepers', async () => {
    setup()
    window.dispatchEvent(new Event('nextgen:open-lesson'))
    await screen.findByRole('button', { name: 'โจมตีมอนสเตอร์ 1' })

    expect(screen.getAllByText(/Lv\.2 ผู้พิทักษ์เงา/)).toHaveLength(3)
    const slimeButton = screen.getByRole('button', { name: 'โจมตีมอนสเตอร์ 4' })
    expect(slimeButton.textContent).toContain('Lv.1 สไลม์เจล')
    expect(slimeButton.querySelector("svg[data-body='slime']")).toBeTruthy()
    const mushroomButton = screen.getByRole('button', { name: 'โจมตีมอนสเตอร์ 5' })
    expect(mushroomButton.textContent).toContain('Lv.3 เห็ดสปอร์')
    expect(mushroomButton.querySelector("svg[data-body='mushroom']")).toBeTruthy()
  })

  it('attacks immediately when clicking a monster already within melee range', async () => {
    setup(lesson, { random: () => 0 })
    window.dispatchEvent(new Event('nextgen:open-lesson'))
    const monster1 = await screen.findByRole('button', { name: 'โจมตีมอนสเตอร์ 1' })
    expect(monster1.textContent).toContain('100/100')

    fireEvent.click(monster1)

    expect(monster1.textContent).toContain('55/100')
  })

  it('walks to a distant monster before attacking when clicked out of melee range', async () => {
    const { player } = openLessonWithFakeTimers({ random: () => 0 })
    try {
      // Monster 2 spawns at (58%, 38%), far from the zone-1 player spawn (18%, 62%) — well outside
      // LESSON_PLAYER_ATTACK_RANGE, so a click should walk the player there instead of whiffing in place.
      const monster2 = screen.getByRole('button', { name: 'โจมตีมอนสเตอร์ 2' })
      const startPosition = positionStyle(player)

      fireEvent.click(monster2)
      expect(monster2.textContent).toContain('100/100')
      expect(player.getAttribute('data-action')).toBe('walk')

      await act(() => vi.advanceTimersByTimeAsync(4000))

      expect(positionStyle(player)).not.toBe(startPosition)
      expect(monster2.textContent).not.toContain('100/100')
    } finally {
      vi.useRealTimers()
    }
  })

  it('hunts and attacks monsters on its own while auto-battle mode is enabled', async () => {
    const { player } = openLessonWithFakeTimers({ random: () => 0 })
    try {
      const autoButton = screen.getAllByRole('button', { name: 'สลับโหมดโจมตีอัตโนมัติ' })[0]
      const monster1 = screen.getByRole('button', { name: 'โจมตีมอนสเตอร์ 1' })
      const startPosition = positionStyle(player)
      expect(monster1.textContent).toContain('100/100')

      fireEvent.click(autoButton)
      expect(autoButton.getAttribute('aria-pressed')).toBe('true')

      // Monster 1 spawns inside melee range: the bot should strike it without
      // any player input once the attack cadence ticks over.
      await act(() => vi.advanceTimersByTimeAsync(1500))
      expect(monster1.textContent).not.toContain('100/100')

      // After clearing nearby targets the bot walks toward the next monster.
      await act(() => vi.advanceTimersByTimeAsync(6000))
      expect(positionStyle(player)).not.toBe(startPosition)

      fireEvent.click(autoButton)
      expect(autoButton.getAttribute('aria-pressed')).toBe('false')
    } finally {
      vi.useRealTimers()
    }
  })

  it('populates zone 2 with SVG bat and grimoire field monsters', async () => {
    setup(lesson, { random: () => 0 })
    vi.useFakeTimers()
    try {
      act(() => { window.dispatchEvent(new Event('nextgen:open-lesson')) })
      await enterZone2()

      expect(screen.getAllByText(/Lv\.3 ค้างคาวเงา/)).toHaveLength(2)
      const grimoireButton = screen.getByRole('button', { name: 'โจมตีมอนสเตอร์เฝ้าหอ 4' })
      expect(grimoireButton.textContent).toContain('Lv.5 ตำราผีสิง')
      expect(grimoireButton.querySelector("svg[data-body='tome']")).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('applies allocated STR/VIT/LUK stats to the adventure hero', async () => {
    const service: LessonService = {
      getCurrentLesson: vi.fn(() => lesson),
      getCurrentUser: vi.fn(() => ({
        id: 'u1', avatar: '🧙', xp: 100, coins: 20, level: 2, rank: 'BRONZE', passedLessons: [],
        inventory: { stats: { str: 5, vit: 5, dex: 0, luk: 10 } },
      })),
      getTimerPerQuestion: vi.fn(() => 30),
      loadQuestions: vi.fn().mockResolvedValue({ success: true, data: bossQuestions }),
      saveProgress: vi.fn().mockResolvedValue({ success: true, stats: { xp: 110, coins: 25, level: 2, rank: 'BRONZE', gainedXp: 10, alreadyPassed: false } }),
      trackDailyProgress: vi.fn(),
    }
    render(<LessonPage service={service} onBack={vi.fn()} onStartQuiz={vi.fn()} onOpenWorksheet={vi.fn()} random={() => 0.86} />)
    window.dispatchEvent(new Event('nextgen:open-lesson'))
    await screen.findByRole('button', { name: 'โจมตีมอนสเตอร์ 1' })

    expect(screen.getByText('HP 130/130')).toBeTruthy()
    expect(screen.getByText(/ATK 55/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'โจมตีด้วยดาบ' }))
    expect(screen.getByText('-122 CRIT!')).toBeTruthy()
  })

  it('spends SP on the heavy skill for double damage', async () => {
    setup(lesson, { random: () => 0 })
    window.dispatchEvent(new Event('nextgen:open-lesson'))
    const monster = await screen.findByRole('button', { name: 'โจมตีมอนสเตอร์ 1' })
    vi.useFakeTimers()

    try {
      fireEvent.keyDown(window, { key: 'e' })
      expect(monster.textContent).toContain('10/100')
      expect(screen.getByText('SP 75/100')).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: 'สกิลฟันหนัก' }))
      expect(monster.getAttribute('data-mode')).toBe('dead')
      expect(screen.getByText('SP 50/100')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('lands critical hits with a big damage float and hit spark', async () => {
    setup(lesson, { random: () => 0.95 })
    window.dispatchEvent(new Event('nextgen:open-lesson'))
    const monster = await screen.findByRole('button', { name: 'โจมตีมอนสเตอร์ 1' })

    fireEvent.click(screen.getByRole('button', { name: 'โจมตีด้วยดาบ' }))

    expect(screen.getByText('-102 CRIT!')).toBeTruthy()
    expect(screen.getByTestId('hit-spark')).toBeTruthy()
    expect(monster.getAttribute('data-mode')).toBe('dead')
  })

  it('drops a rare monster card, logs the pickup, and boosts ATK when sealed', async () => {
    setup(lesson, { random: () => 0.72 })
    window.dispatchEvent(new Event('nextgen:open-lesson'))
    await screen.findByRole('button', { name: 'โจมตีมอนสเตอร์ 1' })
    const attack = screen.getByRole('button', { name: 'โจมตีด้วยดาบ' })

    fireEvent.click(attack)
    fireEvent.click(attack)
    fireEvent.click(screen.getByRole('button', { name: 'เก็บการ์ดมอนสเตอร์' }))

    expect(screen.getByTestId('lesson-loot-feed').textContent).toContain('การ์ดมอนสเตอร์ x1')
    fireEvent.click(screen.getByRole('button', { name: 'ใช้การ์ดมอนสเตอร์' }))
    expect(screen.getByText(/ATK 53/)).toBeTruthy()
  })

  it('respawns defeated monsters so the field can be farmed', async () => {
    setup(lesson, { random: () => 0.95 })
    vi.useFakeTimers()

    try {
      window.dispatchEvent(new Event('nextgen:open-lesson'))
      await act(() => vi.advanceTimersByTimeAsync(0))
      const monster = screen.getByRole('button', { name: 'โจมตีมอนสเตอร์ 1' })

      fireEvent.click(screen.getByRole('button', { name: 'โจมตีด้วยดาบ' }))
      expect(monster.getAttribute('data-mode')).toBe('dead')

      await act(() => vi.advanceTimersByTimeAsync(8600))
      expect(monster.getAttribute('data-mode')).not.toBe('dead')
      expect(monster.textContent).toContain('100/100')
    } finally {
      vi.useRealTimers()
    }
  })

  it('warns when quick-use hotkeys have no items in the bag', async () => {
    setup()
    window.dispatchEvent(new Event('nextgen:open-lesson'))
    await screen.findByTestId('lesson-adventure-world')

    fireEvent.keyDown(window, { key: '1' })
    expect(screen.getByText(/ไม่มียาฟื้นฟูในกระเป๋า/)).toBeTruthy()
    fireEvent.keyDown(window, { key: '2' })
    expect(screen.getByText(/ยังไม่มีการ์ดมอนสเตอร์/)).toBeTruthy()
  })

  it('plays a death animation then offers Ragnarok-style revive choices once HP hits zero', async () => {
    const { world, player } = openLessonWithFakeTimers({ random: () => 0 })

    try {
      await letMonsterKillPlayer(world)

      expect(player.getAttribute('data-action')).toBe('dead')
      expect(screen.getByRole('dialog', { name: 'ตัวเลือกหลังพ่ายแพ้' })).toBeTruthy()
      expect(screen.getByText('ผู้กล้าล้มลง...')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'ฟื้นฟูจุดเริ่มต้น' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'ออกจากแผนที่' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'ออกจากเกมส์' })).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores movement and attack input while the death choice is pending', async () => {
    const { world, player } = openLessonWithFakeTimers({ random: () => 0 })

    try {
      await letMonsterKillPlayer(world)
      const framePosition = player.getAttribute('style')

      fireEvent.keyDown(window, { key: 'ArrowRight' })
      await act(() => vi.advanceTimersByTimeAsync(200))
      fireEvent.keyDown(window, { key: ' ', code: 'Space' })

      expect(player.getAttribute('style')).toBe(framePosition)
      expect(player.getAttribute('data-action')).toBe('dead')
      expect(screen.queryByTestId('lesson-slash-effect')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('respawns at the zone checkpoint with full HP when choosing to revive', async () => {
    const { world, player } = openLessonWithFakeTimers({ random: () => 0 })

    try {
      await letMonsterKillPlayer(world)
      fireEvent.click(screen.getByRole('button', { name: 'ฟื้นฟูจุดเริ่มต้น' }))

      expect(screen.queryByRole('dialog', { name: 'ตัวเลือกหลังพ่ายแพ้' })).toBeNull()
      expect(player.getAttribute('data-action')).not.toBe('dead')
      expect(screen.getByText('HP 100/100')).toBeTruthy()

      fireEvent.keyDown(window, { key: 'ArrowRight' })
      await act(() => vi.advanceTimersByTimeAsync(16))
      expect(player.getAttribute('data-direction')).toBe('right')
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves the map when choosing to exit after death', async () => {
    const { world, onBack } = openLessonWithFakeTimers({ random: () => 0 })

    try {
      await letMonsterKillPlayer(world)
      fireEvent.click(screen.getByRole('button', { name: 'ออกจากแผนที่' }))
      expect(onBack).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('exits the game when choosing to quit after death', async () => {
    const { world, onExitGame } = openLessonWithFakeTimers({ random: () => 0 })

    try {
      await letMonsterKillPlayer(world)
      fireEvent.click(screen.getByRole('button', { name: 'ออกจากเกมส์' }))
      expect(onExitGame).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders the selected lesson when the legacy bridge opens it', async () => {
    const { service } = setup()

    window.dispatchEvent(new Event('nextgen:open-lesson'))

    expect(service.getCurrentLesson).toHaveBeenCalledOnce()
    expect(await screen.findByRole('heading', { name: lesson.title, hidden: true })).toBeTruthy()
    openQuestCard()
    expect(screen.getByText(lesson.description)).toBeTruthy()
    expect(screen.getByText('ภารกิจบทเรียน 0/3')).toBeTruthy()
  })

  it('applies an explicit themed map set and deterministic monster skins without changing species', async () => {
    setup({ ...lesson, lessonMapSet: 'desert-ruins' })
    window.dispatchEvent(new Event('nextgen:open-lesson'))

    const world = await screen.findByTestId('lesson-adventure-world')
    expect(world.getAttribute('data-map-set')).toBe('desert-ruins')
    const firstMonster = document.querySelector('[aria-label^="โจมตีมอนสเตอร์"]') as HTMLElement | null
    expect(firstMonster?.dataset.species).toBe('shadow-keeper')
    expect(firstMonster?.dataset.skin).toBe('tiny-orc')
    expect(firstMonster?.querySelector('[data-monster-skin="tiny-orc"]')).toBeTruthy()
  })

  it('keeps worksheet and retreat actions available from the adventure HUD', async () => {
    setup({ ...lesson, content: '', videoUrl: '' })

    window.dispatchEvent(new Event('nextgen:open-lesson'))

    expect(await screen.findByRole('button', { name: 'ถอยทัพกลับแผนที่' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /เปิดทำใบงาน/, hidden: true })).toBeTruthy()
  })

  it('delegates navigation and worksheet actions to the compatibility bridge', async () => {
    const handlers = setup()
    window.dispatchEvent(new Event('nextgen:open-lesson'))

    // Worksheet first: retreating now closes the run (the page empties), so
    // the header actions are only reachable while the lesson is active.
    fireEvent.click(await screen.findByRole('button', { name: /เปิดทำใบงาน/, hidden: true }))
    fireEvent.click(screen.getByRole('button', { name: 'ถอยทัพกลับแผนที่' }))

    expect(handlers.onBack).toHaveBeenCalledOnce()
    expect(handlers.onOpenWorksheet).toHaveBeenCalledOnce()
    expect(handlers.onStartQuiz).not.toHaveBeenCalled()
  })

  it('stays empty when no lesson is selected', () => {
    setup(null)
    window.dispatchEvent(new Event('nextgen:open-lesson'))

    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('renders a mobile top-right menu with back and worksheet shortcuts that delegate to the same callbacks', async () => {
    const handlers = setup()
    window.dispatchEvent(new Event('nextgen:open-lesson'))

    const menu = await screen.findByTestId('lesson-topright-menu')
    // Worksheet first: the back shortcut closes the run and empties the page.
    fireEvent.click(within(menu).getByRole('button', { name: 'ปุ่มลัดใบงาน' }))
    fireEvent.click(within(menu).getByRole('button', { name: 'กลับแผนที่โลกแบบย่อ' }))

    expect(handlers.onBack).toHaveBeenCalledOnce()
    expect(handlers.onOpenWorksheet).toHaveBeenCalledOnce()
  })

  it('keeps the original desktop header actions as the only elements matching their accessible names', async () => {
    setup()
    window.dispatchEvent(new Event('nextgen:open-lesson'))

    expect(await screen.findByRole('button', { name: 'ถอยทัพกลับแผนที่' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /เปิดทำใบงาน/, hidden: true })).toBeTruthy()
    expect(screen.getByTestId('lesson-topright-menu')).toBeTruthy()
  })

  it('defaults to a compact quest summary and expands into the full detail panel on tap', async () => {
    setup()
    window.dispatchEvent(new Event('nextgen:open-lesson'))

    await screen.findByTestId('lesson-adventure-world')
    expect(screen.queryByTestId('lesson-quest-objectives')).toBeNull()
    expect(screen.getByRole('button', { name: 'ขยายหน้าต่างเควส' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'ขยายหน้าต่างเควส' }))
    expect(screen.getByTestId('lesson-quest-objectives')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'ย่อหน้าต่างเควส' }))
    expect(screen.queryByTestId('lesson-quest-objectives')).toBeNull()
  })

  it('shows a boss top bar mirroring the boss HP and question progress during the skirmish', async () => {
    setup(lesson, { random: () => 0, videoUnlockMs: 0 })
    vi.useFakeTimers()
    try {
      act(() => { window.dispatchEvent(new Event('nextgen:open-lesson')) })
      await enterBossRoom()
    } finally {
      vi.useRealTimers()
    }

    fireEvent.click(screen.getByRole('button', { name: 'ท้าทายบอสบทเรียน' }))
    await waitFor(() => expect(screen.getByTestId('lesson-boss-hud')).toBeTruthy())

    const topbar = document.querySelector('.lesson-boss-topbar')
    expect(topbar).toBeTruthy()
    expect(topbar?.textContent).toContain('บอสบทเรียน')
    expect(topbar?.textContent).toContain(`คำถามเหลือ ${bossQuestions.length}/${bossQuestions.length}`)
  })

  // Same persistent tracker the hub and map show, so the active teacher
  // quest stays visible while fighting monsters/bosses in the lesson too.
  describe('teacher quest tracker', () => {
    const trackedQuestView = () => buildStudentQuestView(
      {
        questId: 'TQ001',
        lessonId: 'lesson-1',
        lessonTitle: 'ป่าแห่งเศษส่วน',
        title: 'ภารกิจ: ป่าแห่งเศษส่วน',
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
      const handlers = setup(lesson, {}, {
        loadQuestBoard: vi.fn().mockResolvedValue({ success: true, data: [trackedQuestView()] }),
      })
      window.dispatchEvent(new Event('nextgen:open-lesson'))

      const tracker = await screen.findByTestId('lesson-npc-tracker')
      expect(tracker.textContent).toContain('ภารกิจ: ป่าแห่งเศษส่วน')

      // Clicking the tracker itself must never leave the lesson on its own.
      // Re-query after the async board load so the click always targets the
      // tracker from the latest lesson render.
      fireEvent.click(screen.getByTestId('lesson-npc-tracker'))
      expect(handlers.onBack).not.toHaveBeenCalled()
      expect(handlers.onOpenNpc).not.toHaveBeenCalled()
      const detail = await screen.findByTestId('lesson-npc-tracker-detail')

      // Only the explicit "go to the NPC" button inside the detail card does.
      fireEvent.click(within(detail).getByRole('button', { name: /ไปหาครูวีรภัทร์/ }))
      expect(handlers.onBack).toHaveBeenCalledTimes(1)
      expect(handlers.onOpenNpc).toHaveBeenCalledTimes(1)
    })

    it('hides during a boss question so it never covers the live quiz choices', async () => {
      setup(lesson, { random: () => 0, videoUnlockMs: 0 }, {
        loadQuestBoard: vi.fn().mockResolvedValue({ success: true, data: [trackedQuestView()] }),
      })
      vi.useFakeTimers()
      try {
        act(() => { window.dispatchEvent(new Event('nextgen:open-lesson')) })
        await enterBossRoom()
      } finally {
        vi.useRealTimers()
      }

      await screen.findByTestId('lesson-npc-tracker')

      const world = screen.getByTestId('lesson-adventure-world')
      const player = screen.getByTestId('lesson-player')
      vi.spyOn(world, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, width: 1000, height: 1000, x: 0, y: 0, right: 1000, bottom: 1000, toJSON: () => ({}),
      })

      fireEvent.click(screen.getByTestId('lesson-boss-challenge'))
      await waitFor(() => expect(screen.getByTestId('lesson-boss-attack-button')).toBeTruthy())
      fireEvent.click(screen.getByRole('button', { name: 'สลับโหมดโจมตีอัตโนมัติ' }))

      vi.useFakeTimers()
      try {
        fireEvent.mouseDown(world, { clientX: 500, clientY: 430, button: 0 })
        await act(() => vi.advanceTimersByTimeAsync(3200))
        expect(positionStyle(player)).toContain('left: 50%; top: 43%;')

        const attack = screen.getByTestId('lesson-boss-attack-button')
        await act(async () => { fireEvent.click(attack) })
        await act(async () => { fireEvent.click(attack) })
        await act(async () => { fireEvent.click(attack) })

        expect(screen.getByTestId('lesson-boss-question-panel')).toBeTruthy()
        expect(screen.queryByTestId('lesson-npc-tracker')).toBeNull()

        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: /Correct boss 1/ }))
        })
        expect(screen.queryByTestId('lesson-boss-question-panel')).toBeNull()
        expect(screen.getByTestId('lesson-npc-tracker')).toBeTruthy()
      } finally {
        vi.useRealTimers()
      }
    })
  })
})

describe('toLessonEmbedUrl', () => {
  it.each([
    ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
    ['https://youtube.com/shorts/dQw4w9WgXcQ?feature=share', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
    ['https://example.com/lesson.mp4', 'https://example.com/lesson.mp4'],
  ])('normalizes %s', (input, expected) => {
    expect(toLessonEmbedUrl(input)).toBe(expected)
  })
})
