import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { WalkDirection } from './dashboardCharacter'
import { joystickDirection, joystickVector, type JoystickVector } from './virtualJoystickLogic'

const JOYSTICK_RADIUS = 42
const IDLE_VECTOR: JoystickVector = { dx: 0, dy: 0, distance: 0, magnitude: 0 }

type Props = {
  onDirection(direction: WalkDirection | null): void
  label?: string
}

export function VirtualJoystick({ onDirection, label = 'จอยสติ๊กควบคุมทิศทาง' }: Props) {
  const baseRef = useRef<HTMLDivElement>(null)
  const activePointerId = useRef<number | null>(null)
  const lastDirection = useRef<WalkDirection | null>(null)
  const [thumb, setThumb] = useState<JoystickVector>(IDLE_VECTOR)

  const updateFromPointer = useCallback((clientX: number, clientY: number) => {
    const base = baseRef.current
    if (!base) return
    const rect = base.getBoundingClientRect()
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    const vector = joystickVector(center, { x: clientX, y: clientY }, JOYSTICK_RADIUS)
    setThumb(vector)
    const direction = joystickDirection(vector.dx, vector.dy, vector.magnitude)
    if (direction !== lastDirection.current) {
      lastDirection.current = direction
      onDirection(direction)
    }
  }, [onDirection])

  const stop = useCallback(() => {
    activePointerId.current = null
    setThumb(IDLE_VECTOR)
    if (lastDirection.current !== null) {
      lastDirection.current = null
      onDirection(null)
    }
  }, [onDirection])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button > 0) return
    activePointerId.current = event.pointerId
    event.currentTarget.setPointerCapture?.(event.pointerId)
    updateFromPointer(event.clientX, event.clientY)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== event.pointerId) return
    updateFromPointer(event.clientX, event.clientY)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== event.pointerId) return
    stop()
  }

  return (
    <div
      ref={baseRef}
      className="virtual-joystick"
      data-testid="virtual-joystick"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <div className="virtual-joystick-thumb" data-testid="virtual-joystick-thumb" style={{ transform: `translate(${thumb.dx}px, ${thumb.dy}px)` }} />
    </div>
  )
}
