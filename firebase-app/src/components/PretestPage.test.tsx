// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PretestPage, type QuizQuestion } from './PretestPage'

afterEach(cleanup)

const lesson = { id: 'l1', title: 'ด่านเศษส่วน' }
const questions: QuizQuestion[] = [
  { qId: 'q1', text: '1 + 1 เท่ากับ?', options: ['1', '2', '3', '4'], answer: 1, pattern: 'choice' },
  { qId: 'q2', text: 'จับคู่ให้ถูก', options: [], answer: 0, pattern: 'matching', matchingPairs: [{ left: 'A', right: 'ก' }] },
]

function setup(data = questions) {
  const service = { loadQuestions: vi.fn().mockResolvedValue({ success: true, data }) }
  const onBack = vi.fn()
  const onContinue = vi.fn()
  render(<PretestPage service={service} onBack={onBack} onContinue={onContinue} />)
  return { service, onBack, onContinue }
}

describe('PretestPage', () => {
  it('loads the selected lesson and scores choice plus matching questions', async () => {
    const { service, onContinue } = setup()
    window.dispatchEvent(new CustomEvent('nextgen:start-pretest', { detail: lesson }))

    expect(await screen.findByText('1 + 1 เท่ากับ?')).toBeTruthy()
    expect(service.loadQuestions).toHaveBeenCalledWith('l1')
    fireEvent.click(screen.getByRole('button', { name: /2/ }))
    expect(await screen.findByText('จับคู่ให้ถูก')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'A' }))
    fireEvent.click(screen.getByRole('button', { name: 'ก' }))
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันการจับคู่' }))

    expect(await screen.findByText('คะแนน: 2/2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /ไปดูเนื้อหาเลย/ }))
    expect(onContinue).toHaveBeenCalledOnce()
  })

  it('skips directly to the lesson when no pretest questions exist', async () => {
    const { onContinue } = setup([])
    window.dispatchEvent(new CustomEvent('nextgen:start-pretest', { detail: lesson }))
    await waitFor(() => expect(onContinue).toHaveBeenCalledOnce())
  })

  it('shows a retry state when Firestore loading fails', async () => {
    const service = { loadQuestions: vi.fn().mockRejectedValue(new Error('offline')) }
    render(<PretestPage service={service} onBack={vi.fn()} onContinue={vi.fn()} />)
    window.dispatchEvent(new CustomEvent('nextgen:start-pretest', { detail: lesson }))

    expect(await screen.findByText('โหลด Pre-test ไม่สำเร็จ')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'ลองใหม่' }))
    expect(service.loadQuestions).toHaveBeenCalledTimes(2)
  })
})
