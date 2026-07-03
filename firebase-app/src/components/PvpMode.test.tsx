// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PvpMode, type PvpMatch, type PvpService } from './PvpMode'
import type { QuizQuestion } from './QuizQuestionView'

afterEach(cleanup)

const user = { id: 'u1', name: 'ฟ้า', avatar: '🧙' }
const waiting: PvpMatch = { success: true, matchId: 'm1', role: 'Player1', p1Id: 'u1', p2Id: null, p1Name: 'ฟ้า', p2Name: '', p1Avatar: '🧙', p2Avatar: '', p1Hp: 100, p2Hp: 100, p1Ready: false, p2Ready: false, status: 'WAITING' }
const lobby: PvpMatch = { ...waiting, p2Id: 'u2', p2Name: 'เมฆ', p2Avatar: '🧛', status: 'LOBBY' }
const playing: PvpMatch = { ...lobby, p1Ready: true, p2Ready: true, status: 'PLAYING' }
const questions: QuizQuestion[] = [
  { qId: 'q1', text: 'ข้อหนึ่ง', options: ['ผิด', 'ถูก'], answer: 1 },
  { qId: 'q2', text: 'ข้อสอง', options: ['ถูกสอง', 'ผิดสอง'], answer: 0 },
]

function setup() {
  let subscriber: ((match: PvpMatch) => void) | undefined
  const unsubscribe = vi.fn()
  const service: PvpService = {
    getCurrentUser: () => user,
    createOrJoinMatch: vi.fn().mockResolvedValue(waiting),
    subscribeToMatch: vi.fn((_id, onData) => { subscriber = onData; return unsubscribe }),
    loadQuestions: vi.fn().mockResolvedValue({ success: true, data: questions }),
    setReady: vi.fn().mockResolvedValue({ ...lobby, p1Ready: true }),
    updateHp: vi.fn().mockResolvedValue({ success: true, status: 'PLAYING' }),
    finishMatch: vi.fn().mockResolvedValue({ success: true, status: 'PLAYING' }),
    leaveMatch: vi.fn().mockResolvedValue({ success: true }),
  }
  const onExit = vi.fn()
  render(<PvpMode service={service} onExit={onExit} />)
  window.dispatchEvent(new Event('nextgen:open-pvp'))
  return { service, onExit, emit: (match: PvpMatch) => subscriber?.(match), unsubscribe }
}

describe('PvpMode', () => {
  it('validates private PIN before creating a room', async () => {
    const { service } = setup()
    fireEvent.change(await screen.findByPlaceholderText('กรอกรหัสห้อง 4 หลัก'), { target: { value: '12A' } })
    fireEvent.click(screen.getByRole('button', { name: /เข้าห้องท้าสู้ส่วนตัว/ }))
    expect(screen.getByText('กรุณากรอกรหัสตัวเลข 4 หลัก')).toBeTruthy()
    expect(service.createOrJoinMatch).not.toHaveBeenCalled()
  })

  it('creates a quick match, subscribes to the room, and starts after both players are ready', async () => {
    const { service, emit } = setup()
    fireEvent.click(await screen.findByRole('button', { name: /เข้าประลองด่วน/ }))
    expect(await screen.findByText('กำลังหาคู่ประลอง...')).toBeTruthy()
    expect(service.createOrJoinMatch).toHaveBeenCalledWith('u1', 'ฟ้า', '🧙', null)
    expect(service.subscribeToMatch).toHaveBeenCalledWith('m1', expect.any(Function), expect.any(Function))

    emit(lobby)
    expect(await screen.findByText('เมฆ')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /ฉันพร้อมแล้ว/ }))
    await waitFor(() => expect(service.setReady).toHaveBeenCalledWith('m1', 'u1', true))

    emit(playing)
    expect(await screen.findByText('ข้อหนึ่ง')).toBeTruthy()
    expect(service.loadQuestions).toHaveBeenCalledWith('PVP_MODE')
  })

  it('syncs HP after a wrong answer and finishes after all questions', async () => {
    const { service, emit } = setup()
    fireEvent.click(await screen.findByRole('button', { name: /เข้าประลองด่วน/ }))
    await screen.findByText('กำลังหาคู่ประลอง...')
    emit(playing)
    await screen.findByText('ข้อหนึ่ง')
    fireEvent.click(screen.getByRole('button', { name: /ผิด/ }))
    await waitFor(() => expect(service.updateHp).toHaveBeenCalledWith('m1', 'u1', 80))
    fireEvent.click(await screen.findByRole('button', { name: /ถูกสอง/ }))
    await waitFor(() => expect(service.finishMatch).toHaveBeenCalledWith('m1', 'u1'))
    expect(screen.getByText(/รอคู่แข่งสรุปผล/)).toBeTruthy()
  })

  it('shows the result from the current player perspective and cleans up the listener', async () => {
    const { emit, unsubscribe, onExit } = setup()
    fireEvent.click(await screen.findByRole('button', { name: /เข้าประลองด่วน/ }))
    await screen.findByText('กำลังหาคู่ประลอง...')
    emit({ ...playing, status: 'FINISHED', p1Hp: 80, p2Hp: 60 })
    expect(await screen.findByRole('heading', { name: 'ชัยชนะ!' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /กลับไปหน้า Lobby/ }))
    expect(unsubscribe).toHaveBeenCalled()
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('forfeits explicitly before leaving an active battle', async () => {
    const { service, emit, onExit } = setup()
    fireEvent.click(await screen.findByRole('button', { name: /เข้าประลองด่วน/ }))
    await screen.findByText('กำลังหาคู่ประลอง...')
    emit(playing)
    await screen.findByText('ข้อหนึ่ง')
    fireEvent.click(screen.getByRole('button', { name: /ขอยอมแพ้/ }))
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันยอมแพ้' }))
    await waitFor(() => expect(service.updateHp).toHaveBeenCalledWith('m1', 'u1', 0))
    await waitFor(() => expect(service.leaveMatch).toHaveBeenCalledWith('m1'))
    expect(onExit).toHaveBeenCalledOnce()
  })
})
