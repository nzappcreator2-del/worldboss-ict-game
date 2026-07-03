// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdventureMap, type MapService } from './AdventureMap'

const lessons = [
  { id: 'L1', title: 'ด่านป่าเริ่มต้น', description: 'เรียนรู้พื้นฐาน', icon: '🌳' },
  { id: 'L2', title: 'ถ้ำแห่งความมืด', description: 'ทดสอบความรู้', icon: '🦇' },
  { id: 'L3', title: 'ปราสาทมังกร', description: 'ด่านสุดท้าย', icon: '🏰' },
]

afterEach(cleanup)

function setup(passedLessons: string[] = ['L1']) {
  const service: MapService = {
    getCurrentUser: () => ({ id: 'user-1', avatar: '🧙', passedLessons }),
    loadLessons: vi.fn().mockResolvedValue({ success: true, data: lessons, passedLessons }),
  }
  const onSelectLesson = vi.fn()
  render(<AdventureMap service={service} onSelectLesson={onSelectLesson} />)
  return { service, onSelectLesson }
}

describe('AdventureMap', () => {
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

  it('previews an unlocked lesson and enters it only after confirmation', async () => {
    const { onSelectLesson } = setup()
    window.dispatchEvent(new Event('nextgen:open-map'))

    fireEvent.click(await screen.findByRole('button', { name: 'เล่นด่าน ถ้ำแห่งความมืด' }))
    expect(screen.getByRole('dialog', { name: 'ตัวอย่างบทเรียน' })).toBeTruthy()
    expect(onSelectLesson).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'บุกโจมตี!' }))
    expect(onSelectLesson).toHaveBeenCalledWith('L2')
  })

  it('closes the React lesson preview without entering the lesson', async () => {
    const { onSelectLesson } = setup()
    window.dispatchEvent(new Event('nextgen:open-map'))
    fireEvent.click(await screen.findByRole('button', { name: 'เล่นด่าน ถ้ำแห่งความมืด' }))
    fireEvent.click(screen.getByRole('button', { name: 'ปิดตัวอย่างบทเรียน' }))

    expect(screen.queryByRole('dialog', { name: 'ตัวอย่างบทเรียน' })).toBeNull()
    expect(onSelectLesson).not.toHaveBeenCalled()
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
