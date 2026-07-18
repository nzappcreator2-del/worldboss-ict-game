import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  TEST_CHARACTER_SPRITE,
  directionForKey,
  directionTowardTarget,
  movementStepForElapsed,
  nextWalkFrame,
  spriteBackgroundPosition,
  type CharacterPosition,
  type WalkDirection,
} from './dashboardCharacter'
import {
  MAP_START_POSITION,
  MAP_MANUAL_SPEED,
  autoWalkDuration,
  lessonNodePosition,
  mapPointerPosition,
  moveMapCharacter,
} from './adventureMapLogic'
import { characterLayerImages } from './characterAssets'
import { LESSON_MAP_ICON_IMAGES } from './lessonUiAssets'
import { entranceTemplateForLesson } from './mapEntranceTemplates'
import { VirtualJoystick } from './VirtualJoystick'
import iconBook from '../assets/ui/icon-book.png'

export type MapLesson = {
  id: string
  title: string
  description: string
  icon: string
  mapStyle?: string
}

export type MapUser = {
  id: string
  avatar?: string
  gender?: string
  passedLessons?: string[]
  inventory?: unknown
}

export type MapResult = {
  success: boolean
  data?: MapLesson[]
  passedLessons?: string[]
  error?: string
}

export type MapService = {
  getCurrentUser(): MapUser | null
  loadLessons(userId: string): Promise<MapResult>
}

type Props = {
  service: MapService
  onSelectLesson(lessonId: string): void
}

const regionNames = [
  'สะพานแห่งบทเรียน', 'หลักการทำงานของคอมพิวเตอร์', 'ป่าความลับเห็ด',
  'อาณาจักรทะเลทราย', 'หุบเขาหิมะ', 'เส้นทางนักสำรวจ',
  'ที่ราบแห่งความรู้', 'ช่องเขาผจญภัย', 'หมู่บ้านปัญญา',
  'ป่าต้นไม้แห่งความรู้', 'ปราสาทแห่งปัญญา', 'ยอดเขานักปราชญ์',
]

export function AdventureMap({ service, onSelectLesson }: Props) {
  const [lessons, setLessons] = useState<MapLesson[]>([])
  const [passed, setPassed] = useState<string[]>([])
  const [avatar, setAvatar] = useState('🧙')
  const [heroInventory, setHeroInventory] = useState<unknown>(undefined)
  const [heroGender, setHeroGender] = useState<string | undefined>(undefined)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [preview, setPreview] = useState<MapLesson | null>(null)
  const [position, setPosition] = useState<CharacterPosition>(MAP_START_POSITION)
  const [direction, setDirection] = useState<WalkDirection>('down')
  const [frame, setFrame] = useState(0)
  const [walking, setWalking] = useState(false)
  const [transitionMs, setTransitionMs] = useState(0)
  const walkTimer = useRef<number | null>(null)
  const frameTimer = useRef<number | null>(null)
  const heldMoveTimer = useRef<number | null>(null)
  const heldFrameTimer = useRef<number | null>(null)
  const heldDirection = useRef<WalkDirection | null>(null)
  const positionRef = useRef<CharacterPosition>(MAP_START_POSITION)

  const stopWalk = useCallback(() => {
    if (walkTimer.current !== null) window.clearTimeout(walkTimer.current)
    if (frameTimer.current !== null) window.clearInterval(frameTimer.current)
    walkTimer.current = null
    frameTimer.current = null
    setWalking(false)
    setFrame(0)
  }, [])

  const stopHeldMove = useCallback(() => {
    if (heldMoveTimer.current !== null) window.clearInterval(heldMoveTimer.current)
    if (heldFrameTimer.current !== null) window.clearInterval(heldFrameTimer.current)
    heldMoveTimer.current = null
    heldFrameTimer.current = null
    heldDirection.current = null
    setWalking(false)
    setFrame(0)
  }, [])

  const stepManualMove = useCallback((nextDirection: WalkDirection, elapsedMs = 16) => {
    setDirection(nextDirection)
    setTransitionMs(0)
    setWalking(true)
    const nextPosition = moveMapCharacter(positionRef.current, nextDirection, movementStepForElapsed(elapsedMs, MAP_MANUAL_SPEED))
    positionRef.current = nextPosition
    setPosition(nextPosition)
  }, [])

  const startHeldMove = useCallback((nextDirection: WalkDirection) => {
    stopWalk()
    if (heldDirection.current === nextDirection && heldMoveTimer.current !== null) return
    stopHeldMove()
    heldDirection.current = nextDirection
    setDirection(nextDirection)
    setTransitionMs(0)
    setWalking(true)
    heldMoveTimer.current = window.setInterval(() => {
      const activeDirection = heldDirection.current
      if (activeDirection) stepManualMove(activeDirection)
    }, 16)
    heldFrameTimer.current = window.setInterval(() => {
      setFrame((current) => nextWalkFrame(current, TEST_CHARACTER_SPRITE.walkFrames.length))
    }, 110)
  }, [stepManualMove, stopHeldMove, stopWalk])

  const walkTo = useCallback((target: CharacterPosition, lesson?: MapLesson) => {
    stopWalk()
    const duration = autoWalkDuration(positionRef.current, target)
    setDirection(directionTowardTarget(positionRef.current, target))
    setTransitionMs(duration)
    setWalking(duration > 0)
    positionRef.current = target
    setPosition(target)
    if (duration === 0) {
      if (lesson) setPreview(lesson)
      return
    }
    frameTimer.current = window.setInterval(() => {
      setFrame((current) => nextWalkFrame(current, TEST_CHARACTER_SPRITE.walkFrames.length))
    }, 90)
    walkTimer.current = window.setTimeout(() => {
      stopWalk()
      if (lesson) setPreview(lesson)
    }, duration)
  }, [stopWalk])

  const load = useCallback(async () => {
    const user = service.getCurrentUser()
    if (!user) return
    setStatus('loading')
    setPreview(null)
    setAvatar(user.avatar || '🧙')
    setHeroInventory(user.inventory)
    setHeroGender(user.gender)
    try {
      const result = await service.loadLessons(user.id)
      if (!result.success) throw new Error(result.error || 'load failed')
      setLessons(result.data || [])
      setPassed((result.passedLessons || user.passedLessons || []).map(String))
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [service])

  useEffect(() => {
    window.addEventListener('nextgen:open-map', load)
    return () => window.removeEventListener('nextgen:open-map', load)
  }, [load])

  // Live outfit sync: re-read the hero after shop/bag changes so the map
  // character redraws its layers without a page refresh.
  useEffect(() => {
    const sync = () => {
      const user = service.getCurrentUser()
      if (!user) return
      setAvatar(user.avatar || '🧙')
      setHeroInventory(user.inventory ? { ...(user.inventory as Record<string, unknown>) } : undefined)
    }
    window.addEventListener('nextgen:user-updated', sync)
    return () => window.removeEventListener('nextgen:user-updated', sync)
  }, [service])

  useEffect(() => {
    if (!preview) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreview(null) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [preview])

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (status !== 'ready') return
      const target = event.target
      if (target instanceof Element && target.matches('input, textarea, select, button, [contenteditable="true"]')) return
      const nextDirection = directionForKey(event.key)
      if (!nextDirection) return
      event.preventDefault()
      startHeldMove(nextDirection)
    }
    const keyUp = (event: KeyboardEvent) => {
      const nextDirection = directionForKey(event.key)
      if (nextDirection && heldDirection.current === nextDirection) {
        setDirection(nextDirection)
        stopHeldMove()
      }
    }
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    return () => {
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
    }
  }, [startHeldMove, status, stopHeldMove])

  useEffect(() => () => {
    stopWalk()
    stopHeldMove()
  }, [stopHeldMove, stopWalk])

  const routePoints = useMemo(
    () => lessons.map((_, index) => {
      const point = lessonNodePosition(index)
      return `${point.x},${point.y}`
    }).join(' '),
    [lessons],
  )

  const currentLessonIndex = lessons.findIndex((lesson, index) => {
    const unlocked = index === 0 || passed.includes(String(lessons[index - 1]?.id))
    return unlocked && !passed.includes(String(lesson.id))
  })

  const characterSize = 96
  const characterStyle: CSSProperties = {
    left: `${position.x}%`,
    top: `${position.y}%`,
    width: `${characterSize}px`,
    height: `${characterSize}px`,
    transitionDuration: `${transitionMs}ms`,
    backgroundImage: characterLayerImages(heroInventory, heroGender),
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${TEST_CHARACTER_SPRITE.columns * characterSize}px ${TEST_CHARACTER_SPRITE.rows * characterSize}px`,
    backgroundPosition: spriteBackgroundPosition(TEST_CHARACTER_SPRITE, direction, frame, characterSize),
  }

  const moveFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (status !== 'ready' || event.button > 0) return
    const target = event.target
    if (target instanceof Element && target.closest('button, .map-lesson-card, .map-move-controls')) return
    walkTo(mapPointerPosition(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect()))
  }

  const manualMove = (nextDirection: WalkDirection) => {
    stepManualMove(nextDirection, 34)
    setFrame((current) => nextWalkFrame(current, TEST_CHARACTER_SPRITE.walkFrames.length))
    window.setTimeout(stopHeldMove, 80)
  }

  return (
    <div id="dash-tab-map" className="adventure-map" data-testid="adventure-map">
      <div className="adventure-map-vignette" aria-hidden="true" />
      <div className="adventure-map-title" aria-hidden="true"><span>◆</span> แผนที่การผจญภัย <span>◆</span></div>

      <div className="adventure-map-world" data-testid="map-world" onPointerDown={moveFromPointer}>
        <svg className="map-route-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline points={routePoints} />
        </svg>

        {status === 'loading' && <div className="map-status-overlay"><span className="map-loader">◆</span><strong>กำลังเปิดแผนที่...</strong></div>}
        {status === 'error' && <div className="map-status-overlay error"><strong>โหลดแผนที่ไม่สำเร็จ</strong><button type="button" onClick={load}>ลองใหม่</button></div>}
        {status === 'ready' && lessons.length === 0 && <div className="map-status-overlay"><span>🏗️</span><strong>ยังไม่มีด่านผจญภัย</strong></div>}

        {lessons.map((lesson, index) => {
          const unlocked = index === 0 || passed.includes(String(lessons[index - 1]?.id))
          const cleared = passed.includes(String(lesson.id))
          const current = index === currentLessonIndex
          const node = lessonNodePosition(index)
          const template = entranceTemplateForLesson(lesson.mapStyle, index)
          return <div
            key={lesson.id}
            className={`map-lesson-card ${unlocked ? 'unlocked' : 'locked'} ${cleared ? 'cleared' : ''} ${current ? 'current' : ''}`}
            style={{ left: `${node.x}%`, top: `${node.y}%` }}
          >
            {current && <div className="map-current-callout"><strong>{lesson.title}</strong><small>คลิกเพื่อเดินไปยังบทเรียน ⚔️</small></div>}
            <button
              type="button"
              data-testid={`lesson-node-${lesson.id}`}
              data-entrance={template.id}
              disabled={!unlocked}
              aria-label={unlocked ? `เล่นด่าน ${lesson.title}` : `ด่านล็อก ${lesson.title}`}
              onClick={(event) => {
                event.stopPropagation()
                if (unlocked) walkTo(node, lesson)
              }}
            >
              <span className="map-entrance-ring" aria-hidden="true" />
              <span className="map-entrance-art" aria-hidden="true"><template.Art /></span>
              {!unlocked && <span className="map-entrance-lock" aria-hidden="true">
                <img src={LESSON_MAP_ICON_IMAGES.locked} alt="" draggable={false} />
              </span>}
              <b>{cleared ? '✓' : index + 1}</b>
            </button>
            <div className="map-node-label"><span>{regionNames[index] || lesson.title}</span>{!unlocked && <i aria-hidden="true"><img src={LESSON_MAP_ICON_IMAGES.locked} alt="" className="map-node-lock-icon-small" draggable={false} /></i>}</div>
          </div>
        })}

        <div
          className={`dashboard-character-sprite map-character-sprite ${walking ? 'walking' : ''}`}
          data-testid="map-character"
          data-avatar={avatar}
          data-direction={direction}
          data-walking={String(walking)}
          aria-label="ตัวละครผู้เล่นบนแผนที่"
          style={characterStyle}
        >
          <span className="map-character-arrow" aria-hidden="true">◆</span>
          <span className="map-character-ring" aria-hidden="true" />
        </div>

        <div className="map-move-controls" aria-label="ปุ่มควบคุมแผนที่">
          <button type="button" aria-label="เดินขึ้นบนแผนที่" onPointerDown={() => startHeldMove('up')} onPointerUp={stopHeldMove} onPointerLeave={stopHeldMove} onClick={() => manualMove('up')}>▲</button>
          <button type="button" aria-label="เดินซ้ายบนแผนที่" onPointerDown={() => startHeldMove('left')} onPointerUp={stopHeldMove} onPointerLeave={stopHeldMove} onClick={() => manualMove('left')}>◀</button>
          <button type="button" aria-label="เดินลงบนแผนที่" onPointerDown={() => startHeldMove('down')} onPointerUp={stopHeldMove} onPointerLeave={stopHeldMove} onClick={() => manualMove('down')}>▼</button>
          <button type="button" aria-label="เดินขวาบนแผนที่" onPointerDown={() => startHeldMove('right')} onPointerUp={stopHeldMove} onPointerLeave={stopHeldMove} onClick={() => manualMove('right')}>▶</button>
        </div>

        <div className="map-joystick-dock">
          <VirtualJoystick label="จอยสติ๊กควบคุมแผนที่" onDirection={(direction) => (direction ? startHeldMove(direction) : stopHeldMove())} />
        </div>
      </div>

      {preview && createPortal(
        <div className="map-preview-backdrop" role="dialog" aria-label="ตัวอย่างบทเรียน" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null) }}>
          <div className="map-preview-panel">
            <button type="button" className="map-preview-close" aria-label="ปิดตัวอย่างบทเรียน" onClick={() => setPreview(null)}>×</button>
            <span className="map-preview-entrance" aria-hidden="true">
              {(() => {
                const previewIndex = lessons.findIndex((lesson) => lesson.id === preview.id)
                const Template = entranceTemplateForLesson(preview.mapStyle, Math.max(0, previewIndex)).Art
                return <Template />
              })()}
              {preview.icon && <em aria-hidden="true">{preview.icon}</em>}
            </span>
            <p>จุดหมายถัดไป</p>
            <h3>{preview.title}</h3>
            <div className="map-preview-divider">◆ ◆ ◆</div>
            <blockquote>“{preview.description}”</blockquote>
            <div className="map-preview-rewards">
              <span><img src={LESSON_MAP_ICON_IMAGES.reward} alt="" className="map-reward-icon" draggable={false} /> โบนัส XP</span>
              <span><img src={iconBook} alt="" className="map-reward-icon" draggable={false} /> ความรู้ใหม่</span>
            </div>
            <button type="button" className="map-preview-enter" aria-label="บุกโจมตี!" onClick={() => { const lessonId = preview.id; setPreview(null); onSelectLesson(lessonId) }}>⚔️ บุกโจมตี!</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
