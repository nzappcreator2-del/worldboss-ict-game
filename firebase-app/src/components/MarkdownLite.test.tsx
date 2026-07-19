// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkdownLite } from './MarkdownLite'

afterEach(cleanup)

describe('MarkdownLite', () => {
  it('renders inline bold and italic text', () => {
    render(<MarkdownLite text={'**เครือข่าย** คือการ *เชื่อมต่อ* อย่างเป็นระบบ'} />)
    expect(screen.getByText('เครือข่าย', { selector: 'strong' })).toBeTruthy()
    expect(screen.getByText('เชื่อมต่อ', { selector: 'em' })).toBeTruthy()
  })

  it('groups dash bullets into a list and renders headings', () => {
    render(<MarkdownLite text={'## สรุปภาพรวม\n- ขยันมาก\n- ตอบไว\nปิดท้าย'} />)
    expect(screen.getByRole('heading', { name: 'สรุปภาพรวม' })).toBeTruthy()
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toBe('ขยันมาก')
    expect(screen.getByText('ปิดท้าย')).toBeTruthy()
  })

  it('renders numbered lists and note blocks', () => {
    render(<MarkdownLite text={'1. อ่านโจทย์\n2. ตอบคำถาม\n> โหมดสำรองทำงานอยู่'} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('โหมดสำรองทำงานอยู่').closest('blockquote')).toBeTruthy()
  })

  it('never injects raw HTML from the model output', () => {
    const { container } = render(<MarkdownLite text={'<img src=x onerror=alert(1)> สวัสดี **ผู้กล้า**'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
  })
})
