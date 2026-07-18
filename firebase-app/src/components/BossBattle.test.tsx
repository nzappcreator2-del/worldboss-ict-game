// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BossBattle, type BattleService } from './BossBattle'
import type { QuizQuestion } from './QuizQuestionView'

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

const THAI = {
  successHeading: '\u0e1b\u0e23\u0e32\u0e1a\u0e1a\u0e2d\u0e2a\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08!',
  failHeading: '\u0e1e\u0e48\u0e32\u0e22\u0e41\u0e1e\u0e49...',
  starLabel: '\u0e14\u0e32\u0e27',
  potion: '\u0e22\u0e32\u0e1e\u0e22\u0e32\u0e1a\u0e32\u0e25',
  magnifier: '\u0e15\u0e31\u0e14\u0e0a\u0e49\u0e2d\u0e22\u0e2a\u0e4c',
  finishMap: '\u0e01\u0e25\u0e31\u0e1a\u0e41\u0e1c\u0e19\u0e17\u0e35\u0e48\u0e1c\u0e08\u0e0d\u0e20\u0e31\u0e22',
  notFound: '\u0e44\u0e21\u0e48\u0e1e\u0e1a',
}

const lesson = { id: 'l1', title: 'Boss stage', icon: '🐉' }
const user = { id: 'u1', avatar: '🧙', xp: 100, coins: 20, level: 2, rank: 'BRONZE', passedLessons: [], inventory: { potion: 1, magnifier: 1 } }
const questions: QuizQuestion[] = [
  { qId: 'q1', text: 'Question one', options: ['Wrong 1', 'Correct 1'], answer: 1, pattern: 'choice' },
  { qId: 'q2', text: 'Question two', options: ['Correct 2', 'Wrong 2'], answer: 0, pattern: 'choice' },
]

function setup(data = questions, options: { random?: () => number; skillDelayMs?: number } = {}) {
  const service: BattleService = {
    getCurrentUser: vi.fn(() => structuredClone(user)),
    getTimerPerQuestion: vi.fn(() => 30),
    loadQuestions: vi.fn().mockResolvedValue({ success: true, data }),
    saveProgress: vi.fn().mockResolvedValue({ success: true, stats: { xp: 110, coins: 25, level: 2, rank: 'BRONZE', gainedXp: 10, alreadyPassed: false } }),
    consumeItem: vi.fn().mockResolvedValue({ success: true, inventory: { potion: 0, magnifier: 1 } }),
  }
  const onFinish = vi.fn()
  const onUserUpdate = vi.fn()
  render(<BossBattle service={service} onFinish={onFinish} onUserUpdate={onUserUpdate} random={options.random ?? (() => 0)} skillDelayMs={options.skillDelayMs ?? 0} />)
  return { service, onFinish, onUserUpdate }
}

function startBattle() {
  window.dispatchEvent(new CustomEvent('nextgen:start-battle', { detail: lesson }))
}

async function waitForQuestionPhase() {
  const arena = await screen.findByTestId('boss-arena')
  await waitFor(() => expect(arena.getAttribute('data-phase')).toBe('question'))
  return arena
}

function getButtonContaining(text: string) {
  const button = screen.getAllByRole('button').find((node) => node.textContent?.includes(text))
  if (!button) throw new Error(`Missing button containing "${text}"`)
  return button
}

function positionStyle(node: HTMLElement) {
  const style = node.getAttribute('style') || ''
  return style.match(/left:[^;]+; top:[^;]+;/)?.[0] || style
}

function fiveQuestions() {
  return Array.from({ length: 5 }, (_, index): QuizQuestion => ({
    qId: `q${index}`,
    text: `Question ${index + 1}`,
    options: [`Correct ${index}`, `Wrong ${index}`],
    answer: 0,
    pattern: 'choice',
  }))
}

describe('BossBattle', () => {
  it('renders the renovated arena with replaceable player and boss sprite assets', async () => {
    setup()
    startBattle()

    expect(await screen.findByTestId('boss-arena')).toBeTruthy()
    expect(screen.getByTestId('battle-player-sprite')).toBeTruthy()
    expect(screen.getByTestId('battle-boss-sprite')).toBeTruthy()
    expect(screen.getByTestId('boss-attack-button')).toBeTruthy()
  })

  it('shows which combatant receives the heavy hit after an answer', async () => {
    setup()
    startBattle()
    const arena = await waitForQuestionPhase()

    fireEvent.click(screen.getByRole('button', { name: /Correct 1/ }))

    expect(arena.getAttribute('data-impact')).toBe('boss')
  })

  it('starts with normal skirmish attacks before a timed boss skill asks a question', async () => {
    vi.useFakeTimers()
    setup(questions, { skillDelayMs: 1200, random: () => 0 })

    await act(async () => {
      startBattle()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(within(screen.getByTestId('boss-battle-world')).getByTestId('boss-skirmish-panel')).toBeTruthy()
    expect(screen.getByTestId('boss-arena').getAttribute('data-phase')).toBe('skirmish')
    expect(screen.queryByText('Question one')).toBeNull()

    await act(() => vi.advanceTimersByTimeAsync(1199))
    expect(screen.getByTestId('boss-arena').getAttribute('data-phase')).toBe('skirmish')
    await act(() => vi.advanceTimersByTimeAsync(1))

    expect(screen.getByText('Question one')).toBeTruthy()
    expect(screen.getByTestId('boss-arena').getAttribute('data-phase')).toBe('question')
  })

  it('lets the player move around the boss map and manually trade light attacks before the skill question', async () => {
    vi.useFakeTimers()
    setup(questions, { skillDelayMs: 5000, random: () => 0 })

    await act(async () => {
      startBattle()
      await Promise.resolve()
      await Promise.resolve()
    })

    const world = screen.getByTestId('boss-battle-world')
    const player = screen.getByTestId('battle-player-sprite')
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

    expect(screen.getAllByText('100 / 100')).toHaveLength(2)
    await act(() => vi.advanceTimersByTimeAsync(720))
    expect(screen.getAllByText('100 / 100')).toHaveLength(2)

    const startPosition = positionStyle(player)
    fireEvent.mouseDown(world, { clientX: 680, clientY: 620, button: 0 })
    await act(() => vi.advanceTimersByTimeAsync(2300))
    expect(positionStyle(player)).not.toBe(startPosition)

    fireEvent.click(screen.getByTestId('boss-attack-button'))
    expect(screen.getByText('92 / 100')).toBeTruthy()
    expect(screen.getByText('96 / 100')).toBeTruthy()
    expect(screen.queryByText('Question one')).toBeNull()

    await act(() => vi.advanceTimersByTimeAsync(2700))

    expect(screen.getByText('Question one')).toBeTruthy()
    expect(screen.getByText('86 / 100')).toBeTruthy()
  })

  it('keeps boss HP scaled to the total question count and does not end before all questions are reached', async () => {
    setup(fiveQuestions())
    startBattle()
    await waitForQuestionPhase()

    fireEvent.click(screen.getByRole('button', { name: /Correct 0/ }))

    expect(screen.queryByRole('heading', { name: THAI.successHeading })).toBeNull()
    expect(await screen.findByText('80 / 100')).toBeTruthy()
  })

  it('keeps the active battle visible over the legacy page display rule', async () => {
    setup()
    startBattle()

    await screen.findByText('01:00')
    expect(document.getElementById('page-boss-battle')?.style.display).toBe('block')
  })

  it('loads questions, applies the 60% rule, and persists a failed attempt', async () => {
    const { service } = setup()
    startBattle()

    await waitForQuestionPhase()
    expect(screen.getByText('Question one')).toBeTruthy()
    expect(screen.getByText('01:00')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Correct 1/ }))

    await waitForQuestionPhase()
    expect(screen.getByText('Question two')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Wrong 2/ }))

    expect(await screen.findByRole('heading', { name: THAI.failHeading })).toBeTruthy()
    expect(screen.getByText(/1\/2/)).toBeTruthy()
    await waitFor(() => expect(service.saveProgress).toHaveBeenCalledWith('u1', 'l1', 'Failed', 1, 2))
  })

  it('awards three stars for an eighty-percent-or-higher victory and syncs server stats', async () => {
    const five = fiveQuestions()
    const { service, onUserUpdate } = setup(five)
    startBattle()

    for (let index = 0; index < five.length; index++) {
      await waitForQuestionPhase()
      expect(screen.getByText(`Question ${index + 1}`)).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`Correct ${index}`) }))
    }

    expect(await screen.findByRole('heading', { name: THAI.successHeading })).toBeTruthy()
    expect(screen.getByLabelText(`3 ${THAI.starLabel}`)).toBeTruthy()
    await waitFor(() => expect(service.saveProgress).toHaveBeenCalledWith('u1', 'l1', 'Passed', 5, 5))
    await waitFor(() => expect(onUserUpdate).toHaveBeenCalledWith(expect.objectContaining({ xp: 110, coins: 25 })))
  })

  it('resets and hides the battle overlay when returning to the map', async () => {
    const single = [{ qId: 'q1', text: 'Final question', options: ['Correct', 'Wrong'], answer: 0, pattern: 'choice' } satisfies QuizQuestion]
    const { onFinish } = setup(single)
    startBattle()
    await waitForQuestionPhase()
    fireEvent.click(screen.getByRole('button', { name: /Correct/ }))
    await screen.findByRole('heading', { name: THAI.successHeading })

    fireEvent.click(getButtonContaining(THAI.finishMap))

    expect(onFinish).toHaveBeenCalledOnce()
    expect(document.getElementById('page-boss-battle')?.style.display).not.toBe('block')
  })

  it('consumes a magnifier once and removes a wrong choice', async () => {
    const { service } = setup()
    startBattle()
    await waitForQuestionPhase()

    fireEvent.click(getButtonContaining(THAI.magnifier))

    await waitFor(() => expect(service.consumeItem).toHaveBeenCalledWith('u1', 'magnifier'))
    expect(getButtonContaining(THAI.magnifier).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByText('Wrong 1')).toBeNull()
  })

  it('does not heal the player when consuming a potion fails', async () => {
    const { service } = setup()
    vi.mocked(service.consumeItem).mockResolvedValueOnce({ success: false, error: 'offline' })
    startBattle()
    await waitForQuestionPhase()

    fireEvent.click(screen.getByRole('button', { name: /Wrong 1/ }))
    expect(await screen.findByText('50 / 100')).toBeTruthy()
    await waitForQuestionPhase()
    fireEvent.click(getButtonContaining(THAI.potion))

    await waitFor(() => expect(service.consumeItem).toHaveBeenCalledWith('u1', 'potion'))
    expect(screen.getByText('50 / 100')).toBeTruthy()
  })

  it('prevents duplicate potion consumption while Firestore is pending', async () => {
    const { service } = setup()
    let finishConsume: ((value: Awaited<ReturnType<BattleService['consumeItem']>>) => void) | undefined
    const pending = new Promise<Awaited<ReturnType<BattleService['consumeItem']>>>((resolve) => { finishConsume = resolve })
    vi.mocked(service.consumeItem).mockReturnValueOnce(pending)
    startBattle()
    await waitForQuestionPhase()
    fireEvent.click(screen.getByRole('button', { name: /Wrong 1/ }))
    await screen.findByText('50 / 100')
    await waitForQuestionPhase()

    const potion = getButtonContaining(THAI.potion)
    fireEvent.click(potion)
    fireEvent.click(potion)

    expect(service.consumeItem).toHaveBeenCalledTimes(1)
    expect(potion.hasAttribute('disabled')).toBe(true)
    finishConsume?.({ success: true, inventory: { potion: 0, magnifier: 1 } })
    expect(await screen.findByText('80 / 100')).toBeTruthy()
  })

  it('shows a recoverable error when no questions can be loaded', async () => {
    setup([])
    startBattle()

    await waitFor(() => expect(document.getElementById('page-boss-battle')?.textContent).toContain(THAI.notFound))
  })

  it('updates boss sprite action to walk or attack based on proximity', async () => {
    vi.useFakeTimers()
    setup(questions, { skillDelayMs: 5000, random: () => 0 })

    await act(async () => {
      startBattle()
      await Promise.resolve()
      await Promise.resolve()
    })

    const bossSprite = screen.getByTestId('battle-boss-sprite')
    // Out of range: should be walk after interval ticks
    await act(() => vi.advanceTimersByTimeAsync(50))
    expect(bossSprite.getAttribute('data-action')).toBe('walk')

    // Wait until they meet: should change to attack during active attack animation window
    await act(() => vi.advanceTimersByTimeAsync(2250))
    expect(bossSprite.getAttribute('data-action')).toBe('attack')
  })

  it('verifies that boss position left style shifts over time when out of range', async () => {
    vi.useFakeTimers()
    setup(questions, { skillDelayMs: 5000, random: () => 0 })

    await act(async () => {
      startBattle()
      await Promise.resolve()
      await Promise.resolve()
    })

    const target = screen.getByTestId('boss-map-target')
    const startStyle = positionStyle(target)

    // Boss moves towards player (left/down)
    await act(() => vi.advanceTimersByTimeAsync(200))
    const midStyle = positionStyle(target)
    expect(midStyle).not.toBe(startStyle)
  })

  it('stops boss movement and switches action to attack when in range', async () => {
    vi.useFakeTimers()
    setup(questions, { skillDelayMs: 5000, random: () => 0 })

    await act(async () => {
      startBattle()
      await Promise.resolve()
      await Promise.resolve()
    })

    const target = screen.getByTestId('boss-map-target')
    const bossSprite = screen.getByTestId('battle-boss-sprite')

    // Advance enough time so boss is in range and stops moving
    await act(() => vi.advanceTimersByTimeAsync(2000))
    const pos1 = positionStyle(target)

    await act(() => vi.advanceTimersByTimeAsync(300))
    const pos2 = positionStyle(target)

    // Position should be unchanged (stops walking)
    expect(pos1).toBe(pos2)
    expect(bossSprite.getAttribute('data-action')).toBe('attack')
  })

  it('resets boss action to idle and stops movement timer when phase changes to question', async () => {
    vi.useFakeTimers()
    setup(questions, { skillDelayMs: 1200, random: () => 0 })

    await act(async () => {
      startBattle()
      await Promise.resolve()
      await Promise.resolve()
    })

    const bossSprite = screen.getByTestId('battle-boss-sprite')
    // Advance slightly to tick the movement loop to walk
    await act(() => vi.advanceTimersByTimeAsync(50))
    expect(bossSprite.getAttribute('data-action')).toBe('walk')

    // Advance time to trigger question phase
    await act(() => vi.advanceTimersByTimeAsync(1150))
    expect(screen.getByTestId('boss-arena').getAttribute('data-phase')).toBe('question')
    // Action should return to idle
    expect(bossSprite.getAttribute('data-action')).toBe('idle')
  })

  it('clears all boss movement and animation timers when returning to the map or ending battle', async () => {
    const spyClearInterval = vi.spyOn(window, 'clearInterval')
    const single = [{ qId: 'q1', text: 'Final question', options: ['Correct', 'Wrong'], answer: 0, pattern: 'choice' } satisfies QuizQuestion]
    const { onFinish } = setup(single)

    startBattle()
    // Trigger winning outcome
    await waitForQuestionPhase()
    fireEvent.click(screen.getByRole('button', { name: /Correct/ }))
    await screen.findByRole('heading', { name: THAI.successHeading })

    fireEvent.click(getButtonContaining(THAI.finishMap))
    expect(onFinish).toHaveBeenCalledOnce()
    expect(spyClearInterval).toHaveBeenCalled()
  })
})
