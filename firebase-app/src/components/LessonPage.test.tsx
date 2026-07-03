// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LessonPage, type Lesson, type LessonService } from './LessonPage'
import { toLessonEmbedUrl } from './lessonMedia'

afterEach(cleanup)

const lesson = {
  id: 'lesson-1',
  title: 'ป่าแห่งเศษส่วน',
  description: 'เรียนรู้ก่อนเผชิญหน้าบอส',
  content: 'บรรทัดแรก\nบรรทัดที่สอง',
  videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12',
}

function setup(currentLesson: Lesson | null = lesson) {
  const service: LessonService = { getCurrentLesson: vi.fn(() => currentLesson) }
  const onBack = vi.fn()
  const onStartQuiz = vi.fn()
  const onOpenWorksheet = vi.fn()
  render(<LessonPage service={service} onBack={onBack} onStartQuiz={onStartQuiz} onOpenWorksheet={onOpenWorksheet} />)
  return { service, onBack, onStartQuiz, onOpenWorksheet }
}

describe('LessonPage', () => {
  it('renders the selected lesson when the legacy bridge opens it', async () => {
    const { service } = setup()

    window.dispatchEvent(new Event('nextgen:open-lesson'))

    expect(service.getCurrentLesson).toHaveBeenCalledOnce()
    expect(await screen.findByRole('heading', { name: lesson.title, hidden: true })).toBeTruthy()
    expect(screen.getByText(lesson.description)).toBeTruthy()
    expect(screen.getByText(/บรรทัดแรก/).textContent).toContain('บรรทัดที่สอง')
    expect(screen.getByTitle(`วิดีโอบทเรียน ${lesson.title}`).getAttribute('src')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
  })

  it('shows the original empty-video state and always keeps worksheet available', async () => {
    setup({ ...lesson, content: '', videoUrl: '' })

    window.dispatchEvent(new Event('nextgen:open-lesson'))

    expect(await screen.findByText('ไม่มีวิดีโอสำหรับด่านนี้')).toBeTruthy()
    expect(screen.queryByText('บรรทัดแรก')).toBeNull()
    expect(screen.getByRole('button', { name: /เปิดทำใบงาน/, hidden: true })).toBeTruthy()
  })

  it('delegates navigation, worksheet, and quiz actions to the compatibility bridge', async () => {
    const handlers = setup()
    window.dispatchEvent(new Event('nextgen:open-lesson'))

    fireEvent.click(await screen.findByRole('button', { name: /ถอยทัพ/, hidden: true }))
    fireEvent.click(screen.getByRole('button', { name: /เปิดทำใบงาน/, hidden: true }))
    fireEvent.click(screen.getByRole('button', { name: /เข้าปะทะบอส/, hidden: true }))

    expect(handlers.onBack).toHaveBeenCalledOnce()
    expect(handlers.onOpenWorksheet).toHaveBeenCalledOnce()
    expect(handlers.onStartQuiz).toHaveBeenCalledOnce()
  })

  it('stays empty when no lesson is selected', () => {
    setup(null)
    window.dispatchEvent(new Event('nextgen:open-lesson'))

    expect(screen.queryByRole('heading')).toBeNull()
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
