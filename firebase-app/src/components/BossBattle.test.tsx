// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BossBattle, type BattleService } from './BossBattle'
import type { QuizQuestion } from './QuizQuestionView'

afterEach(cleanup)

const lesson = { id: 'l1', title: 'ด่านบอส', icon: '🐉' }
const user = { id: 'u1', avatar: '🧙', xp: 100, coins: 20, level: 2, rank: 'BRONZE', passedLessons: [], inventory: { potion: 1, magnifier: 1 } }
const questions: QuizQuestion[] = [
  { qId: 'q1', text: 'ข้อหนึ่ง', options: ['ผิด 1', 'ถูก 1'], answer: 1, pattern: 'choice' },
  { qId: 'q2', text: 'ข้อสอง', options: ['ถูก 2', 'ผิด 2'], answer: 0, pattern: 'choice' },
]

function setup(data = questions) {
  const service: BattleService = {
    getCurrentUser: vi.fn(() => structuredClone(user)),
    getTimerPerQuestion: vi.fn(() => 30),
    loadQuestions: vi.fn().mockResolvedValue({ success: true, data }),
    saveProgress: vi.fn().mockResolvedValue({ success: true, stats: { xp: 110, coins: 25, level: 2, rank: 'BRONZE', gainedXp: 10, alreadyPassed: false } }),
    consumeItem: vi.fn().mockResolvedValue({ success: true, inventory: { potion: 0, magnifier: 1 } }),
  }
  const onFinish = vi.fn()
  const onUserUpdate = vi.fn()
  render(<BossBattle service={service} onFinish={onFinish} onUserUpdate={onUserUpdate} />)
  return { service, onFinish, onUserUpdate }
}

describe('BossBattle', () => {
  it('keeps the active battle visible over the legacy page display rule', async () => {
    setup()
    window.dispatchEvent(new CustomEvent('nextgen:start-battle', { detail: lesson }))

    await screen.findByText('01:00')
    expect(document.getElementById('page-boss-battle')?.style.display).toBe('block')
  })

  it('loads questions, applies the 60% rule, and persists a failed attempt', async () => {
    const { service } = setup()
    window.dispatchEvent(new CustomEvent('nextgen:start-battle', { detail: lesson }))

    expect(await screen.findByText('ข้อหนึ่ง')).toBeTruthy()
    expect(screen.getByText('01:00')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /ถูก 1/ }))
    expect(await screen.findByText('ข้อสอง')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /ผิด 2/ }))

    expect(await screen.findByRole('heading', { name: 'พ่ายแพ้...' })).toBeTruthy()
    expect(screen.getByText(/ตอบถูก 1\/2 ข้อ/)).toBeTruthy()
    await waitFor(() => expect(service.saveProgress).toHaveBeenCalledWith('u1', 'l1', 'Failed', 1, 2))
  })

  it('awards three stars for an eighty-percent-or-higher victory and syncs server stats', async () => {
    const five = Array.from({ length: 5 }, (_, index): QuizQuestion => ({ qId: `q${index}`, text: `คำถาม ${index + 1}`, options: [`ถูก ${index}`, `ผิด ${index}`], answer: 0, pattern: 'choice' }))
    const { service, onUserUpdate } = setup(five)
    window.dispatchEvent(new CustomEvent('nextgen:start-battle', { detail: lesson }))

    for (let index = 0; index < five.length; index++) {
      expect(await screen.findByText(`คำถาม ${index + 1}`)).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`ถูก ${index}`) }))
    }

    expect(await screen.findByRole('heading', { name: 'ปราบบอสสำเร็จ!' })).toBeTruthy()
    expect(screen.getByLabelText('3 ดาว')).toBeTruthy()
    await waitFor(() => expect(service.saveProgress).toHaveBeenCalledWith('u1', 'l1', 'Passed', 5, 5))
    await waitFor(() => expect(onUserUpdate).toHaveBeenCalledWith(expect.objectContaining({ xp: 110, coins: 25 })))
  })

  it('resets and hides the battle overlay when returning to the map', async () => {
    const single = [{ qId: 'q1', text: 'คำถามสุดท้าย', options: ['ถูก', 'ผิด'], answer: 0, pattern: 'choice' } satisfies QuizQuestion]
    const { onFinish } = setup(single)
    window.dispatchEvent(new CustomEvent('nextgen:start-battle', { detail: lesson }))
    await screen.findByText('คำถามสุดท้าย')
    fireEvent.click(screen.getByRole('button', { name: /ถูก/ }))
    await screen.findByRole('heading', { name: 'ปราบบอสสำเร็จ!' })

    fireEvent.click(screen.getByRole('button', { name: 'กลับแผนที่ผจญภัย' }))

    expect(onFinish).toHaveBeenCalledOnce()
    expect(document.getElementById('page-boss-battle')?.style.display).not.toBe('block')
  })

  it('consumes a magnifier once and removes a wrong choice', async () => {
    const { service } = setup()
    window.dispatchEvent(new CustomEvent('nextgen:start-battle', { detail: lesson }))
    await screen.findByText('ข้อหนึ่ง')

    fireEvent.click(screen.getByRole('button', { name: /ตัดช้อยส์/ }))

    await waitFor(() => expect(service.consumeItem).toHaveBeenCalledWith('u1', 'magnifier'))
    expect(screen.getByRole('button', { name: /ตัดช้อยส์/ }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByText('ผิด 1')).toBeNull()
  })

  it('does not heal the player when consuming a potion fails', async () => {
    const { service } = setup()
    vi.mocked(service.consumeItem).mockResolvedValueOnce({ success: false, error: 'offline' })
    window.dispatchEvent(new CustomEvent('nextgen:start-battle', { detail: lesson }))
    await screen.findByText('ข้อหนึ่ง')

    fireEvent.click(screen.getByRole('button', { name: /ผิด 1/ }))
    expect(await screen.findByText('50 / 100')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /ยาพยาบาล/ }))

    await waitFor(() => expect(service.consumeItem).toHaveBeenCalledWith('u1', 'potion'))
    expect(screen.getByText('50 / 100')).toBeTruthy()
  })

  it('prevents duplicate potion consumption while Firestore is pending', async () => {
    const { service } = setup()
    let finishConsume: ((value: Awaited<ReturnType<BattleService['consumeItem']>>) => void) | undefined
    const pending = new Promise<Awaited<ReturnType<BattleService['consumeItem']>>>((resolve) => { finishConsume = resolve })
    vi.mocked(service.consumeItem).mockReturnValueOnce(pending)
    window.dispatchEvent(new CustomEvent('nextgen:start-battle', { detail: lesson }))
    await screen.findByText('ข้อหนึ่ง')
    fireEvent.click(screen.getByRole('button', { name: /ผิด 1/ }))
    await screen.findByText('50 / 100')

    const potion = screen.getByRole('button', { name: /ยาพยาบาล/ })
    fireEvent.click(potion)
    fireEvent.click(potion)

    expect(service.consumeItem).toHaveBeenCalledTimes(1)
    expect(potion.hasAttribute('disabled')).toBe(true)
    finishConsume?.({ success: true, inventory: { potion: 0, magnifier: 1 } })
    expect(await screen.findByText('80 / 100')).toBeTruthy()
  })

  it('shows a recoverable error when no questions can be loaded', async () => {
    setup([])
    window.dispatchEvent(new CustomEvent('nextgen:start-battle', { detail: lesson }))
    expect(await screen.findByText('ไม่พบคำถามสำหรับด่านนี้')).toBeTruthy()
  })
})
