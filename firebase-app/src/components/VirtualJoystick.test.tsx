// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VirtualJoystick } from './VirtualJoystick'

afterEach(() => cleanup())

function mockBaseRect(base: HTMLElement) {
  vi.spyOn(base, 'getBoundingClientRect').mockReturnValue({
    left: 100, top: 100, width: 84, height: 84, x: 100, y: 100, right: 184, bottom: 184, toJSON: () => ({}),
  })
}

// jsdom has no PointerEvent constructor, so @testing-library's fireEvent.pointerDown falls back
// to a bare Event that silently drops clientX/clientY/pointerId. Build the event by hand instead.
function firePointer(type: 'pointerdown' | 'pointermove' | 'pointerup', el: HTMLElement, init: { pointerId: number; clientX: number; clientY: number; button?: number }) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, init)
  fireEvent(el, event)
}

describe('VirtualJoystick', () => {
  it('reports no direction until the thumb is dragged past the dead zone', () => {
    const onDirection = vi.fn()
    render(<VirtualJoystick onDirection={onDirection} />)
    const base = screen.getByTestId('virtual-joystick')
    mockBaseRect(base)

    firePointer('pointerdown', base, { pointerId: 1, clientX: 142, clientY: 142 })
    expect(onDirection).not.toHaveBeenCalled()
  })

  it('reports a direction once dragged past the dead zone and clears it on release', () => {
    const onDirection = vi.fn()
    render(<VirtualJoystick onDirection={onDirection} />)
    const base = screen.getByTestId('virtual-joystick')
    mockBaseRect(base)

    firePointer('pointerdown', base, { pointerId: 1, clientX: 172, clientY: 142 })
    expect(onDirection).toHaveBeenCalledWith('right')

    firePointer('pointerup', base, { pointerId: 1, clientX: 172, clientY: 142 })
    expect(onDirection).toHaveBeenLastCalledWith(null)
  })

  it('only reacts to the pointer that started the drag', () => {
    const onDirection = vi.fn()
    render(<VirtualJoystick onDirection={onDirection} />)
    const base = screen.getByTestId('virtual-joystick')
    mockBaseRect(base)

    firePointer('pointerdown', base, { pointerId: 1, clientX: 172, clientY: 142 })
    onDirection.mockClear()
    firePointer('pointermove', base, { pointerId: 2, clientX: 142, clientY: 172 })
    expect(onDirection).not.toHaveBeenCalled()

    firePointer('pointerup', base, { pointerId: 2, clientX: 142, clientY: 172 })
    expect(onDirection).not.toHaveBeenCalled()
  })

  it('does not re-fire the same direction while dragging further along the same axis', () => {
    const onDirection = vi.fn()
    render(<VirtualJoystick onDirection={onDirection} />)
    const base = screen.getByTestId('virtual-joystick')
    mockBaseRect(base)

    firePointer('pointerdown', base, { pointerId: 1, clientX: 172, clientY: 142 })
    expect(onDirection).toHaveBeenCalledTimes(1)
    firePointer('pointermove', base, { pointerId: 1, clientX: 180, clientY: 143 })
    expect(onDirection).toHaveBeenCalledTimes(1)
  })
})
