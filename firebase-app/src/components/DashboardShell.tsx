import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { levelProgress } from '../services/levelSystem'
import { characterLayerImages } from './characterAssets'
import {
  DEFAULT_CHARACTER_POSITION,
  CHARACTER_RENDER_SIZE,
  TEST_CHARACTER_SPRITE,
  directionForKey,
  directionTowardTarget,
  moveCharacter,
  moveTowardTarget,
  movementStepForElapsed,
  pointerToWalkPosition,
  spriteBackgroundPosition,
  type CharacterSpriteConfig,
  type WalkDirection,
} from './dashboardCharacter'
import { mobileCameraOffset } from './mobileCameraLogic'
import { VirtualJoystick } from './VirtualJoystick'
import iconBook from '../assets/ui/icon-book.png'
import iconFlame from '../assets/ui/icon-flame.png'
import iconStar from '../assets/ui/icon-star.png'
import chestClosed from '../assets/ui/chest-closed.png'
import itemCoins from '../assets/ui/item-coins.png'
import itemCrown from '../assets/ui/item-crown.png'
import itemMap from '../assets/ui/item-map.png'
import itemScroll from '../assets/ui/item-scroll.png'
import itemShield from '../assets/ui/item-shield.png'

export type DashboardTab = 'home' | 'profile' | 'map' | 'rank' | 'cert'

export type DashboardShellUser = {
  id: string
  name?: string
  class?: string
  avatar?: string
  gender?: string
  xp?: number
  coins?: number
  level?: number
  rank?: string
  streak?: number
  passedLessons?: string[]
  inventory?: unknown
}

// icon is either a raw emoji glyph (rendered as text) or an imported image
// URL (rendered as an <img> — see NavIcon below); painted icons are used
// wherever a matching one exists in src/assets/ui, emoji fills the rest.
const tabs: Array<{ id: DashboardTab; label: string; icon: string }> = [
  { id: 'home', label: 'หน้าหลัก', icon: '🏠' },
  { id: 'profile', label: 'โปรไฟล์', icon: '👤' },
  { id: 'map', label: 'แผนที่', icon: itemMap },
  { id: 'rank', label: 'อันดับ', icon: itemCrown },
  { id: 'cert', label: 'ใบรับรอง', icon: itemScroll },
]

type DashboardShellProps = {
  getCurrentUser(): DashboardShellUser | null
  onNavigate(tab: DashboardTab): void
  onLogout(): void
  home?: ReactNode
  profile?: ReactNode
  map?: ReactNode
  rank?: ReactNode
  cert?: ReactNode
  economy?: ReactNode
  /** ครูวีรภัทร์ quest NPC — a hall inhabitant, mounted only on the home scene. */
  teacherNpc?: ReactNode
  characterSprite?: CharacterSpriteConfig
}

export function DashboardShell({
  getCurrentUser,
  onNavigate,
  onLogout,
  home,
  profile,
  map,
  rank,
  cert,
  economy,
  teacherNpc,
  characterSprite = TEST_CHARACTER_SPRITE,
}: DashboardShellProps) {
  const [user, setUser] = useState<DashboardShellUser | null>(() => getCurrentUser())
  const [active, setActive] = useState<DashboardTab>('home')

  // The legacy bridge mutates its user object in place, so clone on every
  // refresh or React sees the same reference and skips re-rendering (stale
  // outfit/level until a manual page reload).
  const refreshUser = useCallback(() => {
    const next = getCurrentUser()
    setUser(next ? { ...next } : null)
  }, [getCurrentUser])

  useEffect(() => {
    const changeTab = (event: Event) => {
      const tab = (event as CustomEvent<string>).detail as DashboardTab
      if (tabs.some((item) => item.id === tab)) setActive(tab)
    }
    window.addEventListener('nextgen:user-updated', refreshUser)
    window.addEventListener('nextgen:dashboard-tab', changeTab)
    return () => {
      window.removeEventListener('nextgen:user-updated', refreshUser)
      window.removeEventListener('nextgen:dashboard-tab', changeTab)
    }
  }, [refreshUser])

  const navigate = (tab: DashboardTab) => {
    setActive(tab)
    onNavigate(tab)
  }

  const xp = Number(user?.xp) || 0
  const xpProgress = levelProgress(xp)
  const level = Number(user?.level) || xpProgress.level
  // Paper-doll: every equipped LPC layer stacked into one background-image list.
  const layerImages = characterLayerImages(user?.inventory, user?.gender)

  return (
    // data-scene declutters the adventure-map scene (vertical menu rail,
    // hub-only hotspots unmounted). It MUST stay a data attribute: the legacy
    // showPage() toggles hidden/page-active classes on this section, and a
    // React-managed className would wipe them on re-render and blank the page.
    <section id="page-dashboard" className="dashboard-hub" data-scene={active}>
      <header className="dashboard-player-hud">
        <button type="button" className="dashboard-portrait-button" aria-label="เปิดโปรไฟล์ตัวละคร" onClick={() => window.dispatchEvent(new Event('nextgen:open-hero-profile'))}>
          <SpriteFrame className="dashboard-player-portrait" config={characterSprite} direction="down" frame={0} size={72} layerImages={layerImages} />
        </button>
        <div className="dashboard-player-details">
          <div className="dashboard-player-name-row">
            <h2>{user?.name || 'PlayerName'}</h2>
            <span>{user?.class || 'Class'}</span>
          </div>
          <div className="dashboard-health"><span>❤️ 100/100</span><i /></div>
          <div className="dashboard-level-row">
            <strong>Level {level}</strong>
            <span>({xpProgress.intoLevel}/{xpProgress.requiredXp || '-'})</span>
          </div>
          <div className="dashboard-xp-track"><i style={{ width: `${xpProgress.percent}%` }} /></div>
        </div>
      </header>

      {/* Currency/status chips directly under the player plate, MMO-style. */}
      <aside className="dashboard-stat-chips" aria-label="สถิติผู้เล่น">
        <HubStat icon={itemCoins} value={Number(user?.coins) || 0} label="Coins" />
        <HubStat icon={itemShield} value={user?.rank || 'BRONZE'} label="Rank" />
        <HubStat icon={iconFlame} value={`${Number(user?.streak) || 0} วัน`} label="Streak" />
        <HubStat icon={iconBook} value={`${user?.passedLessons?.length || 0} ด่าน`} label="Progress" />
      </aside>

      {/* Icon menu bar, top-right beside the minimap: feature tabs plus shop,
          bag and settings merged into one strip so the hall stays visible. */}
      <nav className={`dashboard-menu-bar${active === 'map' ? ' map-vertical' : ''}`} aria-label="เมนูแดชบอร์ด">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-label={tab.label}
            aria-pressed={active === tab.id}
            onClick={() => navigate(tab.id)}
            className={active === tab.id ? 'active' : ''}
          >
            <NavIcon icon={tab.icon} /><strong>{tab.label}</strong>
          </button>
        ))}
        <button type="button" aria-label="เปิดร้านค้า" onClick={() => window.dispatchEvent(new Event('nextgen:open-shop'))}>
          <NavIcon icon={itemCoins} /><strong>ร้านค้า</strong>
        </button>
        <button type="button" aria-label="เปิดกระเป๋า" onClick={() => window.dispatchEvent(new Event('nextgen:open-inventory'))}>
          <NavIcon icon={chestClosed} /><strong>กระเป๋า</strong>
        </button>
        <button type="button" aria-label="ออกจากเกม" onClick={onLogout} className="dashboard-settings-button">
          <span aria-hidden="true">⚙️</span><strong>ตั้งค่า</strong>
        </button>
      </nav>

      {/* MMO quest tracker, screen-space on the left: main quest points at the
          adventure map, the daily entry opens the quest board panel. Unmounted
          on the map scene so nothing overlaps or ghost-clicks over the map. */}
      {active !== 'map' && <aside className="hub-quest-tracker" aria-label="ตัวติดตามเควส">
        <h3><span aria-hidden="true">◆</span> เควส</h3>
        <button type="button" className="hub-quest-entry hub-quest-main" aria-label="เควสหลัก: ออกผจญภัยด่านต่อไป" onClick={() => navigate('map')}>
          <img src={itemMap} alt="" draggable={false} />
          <span><b>เควสหลัก</b><small>ออกผจญภัยด่านที่ {(user?.passedLessons?.length || 0) + 1}</small></span>
        </button>
        <button type="button" className="hub-quest-entry hub-quest-daily" aria-label="ภารกิจประจำวัน" onClick={() => window.dispatchEvent(new Event('nextgen:open-daily-quests'))}>
          <img src={itemScroll} alt="" draggable={false} />
          <span><b>ภารกิจประจำวัน</b><small>แตะเพื่อดูและรับรางวัล</small></span>
        </button>
      </aside>}

      <div id="react-economy-root" className="contents">{economy}</div>

      <main className="dashboard-hub-content">
        <div id="react-profile-root" className={active === 'profile' ? 'dashboard-feature-panel' : 'hidden'}>{profile}</div>
        <div id="react-map-root" className={active === 'map' ? 'dashboard-map-mount' : 'hidden'}>{map}</div>
        <div id="react-rank-root" className={active === 'rank' ? 'dashboard-feature-panel' : 'hidden'}>{rank}</div>
        <div id="react-cert-root" className={active === 'cert' ? 'dashboard-feature-panel' : 'hidden'}>{cert}</div>
      </main>

      <WalkableCharacter active={active === 'home'} config={characterSprite} layerImages={layerImages} onOpenMap={() => navigate('map')}>
        <div data-testid="dashboard-background" className="dashboard-hub-background" aria-hidden="true" />
        <div className="dashboard-hub-shade" aria-hidden="true" />
        <div id="react-home-root" className={active === 'home' ? 'dashboard-home-mount' : 'hidden'}>{home}</div>

        {/* ครูวีรภัทร์ and the adventure gate belong to world-space, so they
            pan with the hall painting while the screen-space HUD stays fixed. */}
        {active === 'home' && teacherNpc}
        {active === 'home' && (
          <button type="button" className="dashboard-portal-button" aria-label="เริ่มการผจญภัย" onClick={() => navigate('map')}>
            <span>เข้าสู่แผนที่ผจญภัย</span>
          </button>
        )}
      </WalkableCharacter>

      {/* Classic MMO experience strip pinned to the bottom edge. */}
      <div className="dashboard-exp-bar" data-testid="dashboard-exp-bar" aria-label={`เลเวล ${level} ความคืบหน้า ${Math.round(xpProgress.percent)} เปอร์เซ็นต์`}>
        <b><img src={iconStar} alt="" draggable={false} /> Level {level}</b>
        <span className="dashboard-exp-track"><i style={{ width: `${xpProgress.percent}%` }} /></span>
        <small>{xpProgress.intoLevel}/{xpProgress.requiredXp || '-'} XP ({Math.round(xpProgress.percent)}%)</small>
      </div>
    </section>
  )
}

function HubStat({ icon, value, label }: { icon: string; value: string | number; label: string }) {
  return <div aria-label={`${label}: ${value}`}><img className="dashboard-stat-icon" src={icon} alt="" draggable={false} /><strong>{value}</strong></div>
}

// tab.icon is either a raw emoji glyph or an imported PNG URL (always
// containing a '.' + extension, which no emoji does) — render accordingly.
function NavIcon({ icon }: { icon: string }) {
  if (icon.includes('.png') || icon.startsWith('data:')) {
    return <img className="dashboard-nav-icon" src={icon} alt="" draggable={false} />
  }
  return <span aria-hidden="true">{icon}</span>
}

function SpriteFrame({
  config,
  direction,
  frame,
  size,
  className,
  layerImages,
}: {
  config: CharacterSpriteConfig
  direction: WalkDirection
  frame: number
  size: number
  className?: string
  layerImages?: string
}) {
  const style: CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    backgroundSize: `${config.columns * size}px ${config.rows * size}px`,
    backgroundPosition: spriteBackgroundPosition(config, direction, frame, size),
    ...(layerImages ? { backgroundImage: layerImages, backgroundRepeat: 'no-repeat' } : {}),
  }
  return <span className={`dashboard-character-sprite ${className || ''}`} style={style} aria-hidden="true" />
}

function WalkableCharacter({
  active,
  config,
  layerImages,
  onOpenMap,
  children,
}: {
  active: boolean
  config: CharacterSpriteConfig
  layerImages?: string
  onOpenMap?: () => void
  children: ReactNode
}) {
  const [position, setPosition] = useState(DEFAULT_CHARACTER_POSITION)
  const [direction, setDirection] = useState<WalkDirection>('down')
  const [frame, setFrame] = useState(0)
  const activeDirections = useRef(new Set<WalkDirection>())
  const positionRef = useRef(DEFAULT_CHARACTER_POSITION)
  const walkTarget = useRef<typeof DEFAULT_CHARACTER_POSITION | null>(null)
  const lastBroadcast = useRef(0)
  const worldRef = useRef<HTMLDivElement>(null)
  const renderSize = CHARACTER_RENDER_SIZE

  const syncCamera = useCallback(() => {
    const viewport = document.getElementById('page-dashboard')
    const world = worldRef.current
    if (!viewport || !world) return

    const viewportRect = viewport.getBoundingClientRect()
    const worldRect = world.getBoundingClientRect()
    const offset = mobileCameraOffset(
      positionRef.current,
      {
        width: viewport.clientWidth || viewportRect.width,
        height: viewport.clientHeight || viewportRect.height,
      },
      {
        width: world.offsetWidth || worldRect.width,
        height: world.offsetHeight || worldRect.height,
      },
      { x: 0.5, y: 0.58 },
    )
    world.style.setProperty('--camera-x', `${offset.x}px`)
    world.style.setProperty('--camera-y', `${offset.y}px`)
    world.dataset.cameraX = String(offset.x)
    world.dataset.cameraY = String(offset.y)
  }, [])

  useLayoutEffect(() => {
    syncCamera()
  }, [active, position, syncCamera])

  useEffect(() => {
    const visualViewport = window.visualViewport
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(syncCamera)
    let deferredSync: number | null = null
    const scheduleCameraSync = () => {
      syncCamera()
      if (deferredSync !== null) window.clearTimeout(deferredSync)
      deferredSync = window.setTimeout(syncCamera, 0)
    }
    const viewport = document.getElementById('page-dashboard')
    if (viewport) observer?.observe(viewport)
    if (worldRef.current) observer?.observe(worldRef.current)
    window.addEventListener('resize', syncCamera)
    window.addEventListener('nextgen:open-home', scheduleCameraSync)
    window.addEventListener('nextgen:page-changed', scheduleCameraSync)
    window.addEventListener('nextgen:dashboard-tab', scheduleCameraSync)
    visualViewport?.addEventListener('resize', syncCamera)
    return () => {
      if (deferredSync !== null) window.clearTimeout(deferredSync)
      observer?.disconnect()
      window.removeEventListener('resize', syncCamera)
      window.removeEventListener('nextgen:open-home', scheduleCameraSync)
      window.removeEventListener('nextgen:page-changed', scheduleCameraSync)
      window.removeEventListener('nextgen:dashboard-tab', scheduleCameraSync)
      visualViewport?.removeEventListener('resize', syncCamera)
    }
  }, [syncCamera])

  // Throttled position feed for hall inhabitants (ครูวีรภัทร์ walk-up talk):
  // a coarse 4-per-second CustomEvent instead of lifted state, so the shell
  // never re-renders with the 60fps walk loop.
  const broadcastPosition = useCallback((now: number) => {
    if (now - lastBroadcast.current < 250) return
    lastBroadcast.current = now
    window.dispatchEvent(new CustomEvent('nextgen:hub-player-position', {
      detail: { x: positionRef.current.x, y: positionRef.current.y },
    }))
  }, [])

  const pressDirection = useCallback((nextDirection: WalkDirection) => {
    walkTarget.current = null
    activeDirections.current.delete(nextDirection)
    activeDirections.current.add(nextDirection)
    setDirection(nextDirection)
  }, [])

  const releaseDirection = useCallback((nextDirection: WalkDirection) => {
    activeDirections.current.delete(nextDirection)
  }, [])

  const joystickDirectionRef = useRef<WalkDirection | null>(null)
  const handleJoystickDirection = useCallback((nextDirection: WalkDirection | null) => {
    if (joystickDirectionRef.current) releaseDirection(joystickDirectionRef.current)
    joystickDirectionRef.current = nextDirection
    if (nextDirection) pressDirection(nextDirection)
  }, [pressDirection, releaseDirection])

  useEffect(() => {
    if (!active) {
      activeDirections.current.clear()
      walkTarget.current = null
      return
    }
    const directions = activeDirections.current
    const hub = document.getElementById('page-dashboard')
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof Element &&
        target.matches('input, textarea, select, button, [contenteditable="true"]')
      ) return
      const nextDirection = directionForKey(event.key)
      if (!nextDirection) return
      event.preventDefault()
      pressDirection(nextDirection)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      const nextDirection = directionForKey(event.key)
      if (!nextDirection) return
      event.preventDefault()
      releaseDirection(nextDirection)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.button > 0) return
      const target = event.target
      if (
        target instanceof Element &&
        target.closest('button, a, input, textarea, select, [contenteditable="true"], .dashboard-daily-board, .dashboard-news-board, .dashboard-feature-panel')
      ) return
      if (!hub) return
      activeDirections.current.clear()
      const worldRect = worldRef.current?.getBoundingClientRect()
      const walkRect = worldRect && worldRect.width > 0 && worldRect.height > 0
        ? worldRect
        : hub.getBoundingClientRect()
      walkTarget.current = pointerToWalkPosition(event.clientX, event.clientY, walkRect)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    hub?.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      hub?.removeEventListener('pointerdown', onPointerDown)
      directions.clear()
      walkTarget.current = null
    }
  }, [active, pressDirection, releaseDirection])

  useEffect(() => {
    if (!active) return
    let animationId = 0
    let previousTime: number | null = null
    let frameElapsed = 0

    const animate = (time: number) => {
      const elapsed = previousTime === null ? 0 : time - previousTime
      previousTime = time
      const directions = Array.from(activeDirections.current)
      let movingDirection = directions[directions.length - 1]
      const step = movementStepForElapsed(elapsed)

      if (movingDirection) {
        if (step > 0) {
          const nextPosition = moveCharacter(positionRef.current, movingDirection, step)
          positionRef.current = nextPosition
          setPosition(nextPosition)
          broadcastPosition(time)
        }
      } else if (walkTarget.current && step > 0) {
        movingDirection = directionTowardTarget(positionRef.current, walkTarget.current)
        const movement = moveTowardTarget(positionRef.current, walkTarget.current, step)
        positionRef.current = movement.position
        setPosition(movement.position)
        setDirection(movingDirection)
        if (movement.reached) walkTarget.current = null
        broadcastPosition(time)
      }

      if (movingDirection) {
        frameElapsed += Math.min(50, Math.max(0, elapsed))
        if (frameElapsed >= 90) {
          const framesToAdvance = Math.floor(frameElapsed / 90)
          frameElapsed %= 90
          setFrame((current) => (current + framesToAdvance) % config.walkFrames.length)
        }
      } else {
        frameElapsed = 0
        setFrame((current) => current === 0 ? current : 0)
      }

      animationId = window.requestAnimationFrame(animate)
    }

    animationId = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(animationId)
  }, [active, config.walkFrames.length, broadcastPosition])

  const style: CSSProperties = {
    left: `${position.x}%`,
    top: `${position.y}%`,
    width: `${renderSize}px`,
    height: `${renderSize}px`,
    backgroundSize: `${config.columns * renderSize}px ${config.rows * renderSize}px`,
    backgroundPosition: spriteBackgroundPosition(config, direction, frame, renderSize),
    ...(layerImages ? { backgroundImage: layerImages, backgroundRepeat: 'no-repeat' } : {}),
  }

  return (
    <>
      <div
        ref={worldRef}
        data-testid="dashboard-camera-world"
        className={`dashboard-camera-world ${active ? '' : 'hidden'}`}
      >
        {children}
        <div
          data-testid="walkable-character"
          data-direction={direction}
          aria-label="ตัวละครผู้เล่น"
          className="dashboard-walkable-character"
          style={style}
        />
      </div>
      <div className={`dashboard-move-controls ${active ? '' : 'hidden'}`} aria-label="ปุ่มควบคุมตัวละคร">
        <MoveButton direction="up" label="เดินขึ้น" onPress={pressDirection} onRelease={releaseDirection}>▲</MoveButton>
        <MoveButton direction="left" label="เดินซ้าย" onPress={pressDirection} onRelease={releaseDirection}>◀</MoveButton>
        <MoveButton direction="down" label="เดินลง" onPress={pressDirection} onRelease={releaseDirection}>▼</MoveButton>
        <MoveButton direction="right" label="เดินขวา" onPress={pressDirection} onRelease={releaseDirection}>▶</MoveButton>
      </div>
      <div className={`dashboard-joystick-dock ${active ? '' : 'hidden'}`}>
        <VirtualJoystick label="จอยสติ๊กควบคุมตัวละคร" onDirection={handleJoystickDirection} />
      </div>
      {/* Hub minimap lives here (not in the shell body) because this component
          already re-renders with every step of the walkable character, so the
          player blip tracks movement for free. Blip positions mirror the
          hall's fixed landmarks: adventure portal, quest sign, news sign. */}
      <button
        type="button"
        data-testid="hub-minimap"
        className={`hub-minimap ${active ? '' : 'hidden'}`}
        aria-label="มินิแมพห้องกิลด์ แตะเพื่อเปิดแผนที่ผจญภัย"
        onClick={onOpenMap}
      >
        <span className="hub-minimap-canvas" aria-hidden="true">
          <i className="mm-dot mm-portal" style={{ left: '74%', top: '27%' }} />
          <i className="mm-dot mm-quest" style={{ left: '34%', top: '33%' }} />
          <i className="mm-dot mm-quest" style={{ left: '83%', top: '68%' }} />
          <i className="mm-dot mm-player" style={{ left: `${position.x}%`, top: `${position.y}%` }} />
        </span>
        <b>ห้องกิลด์</b>
      </button>
    </>
  )
}

function MoveButton({
  direction,
  label,
  onPress,
  onRelease,
  children,
}: {
  direction: WalkDirection
  label: string
  onPress(direction: WalkDirection): void
  onRelease(direction: WalkDirection): void
  children: ReactNode
}) {
  return <button
    type="button"
    aria-label={label}
    onPointerDown={() => onPress(direction)}
    onPointerUp={() => onRelease(direction)}
    onPointerCancel={() => onRelease(direction)}
    onPointerLeave={() => onRelease(direction)}
    onClick={(event) => {
      if (event.detail === 0) {
        onPress(direction)
        window.setTimeout(() => onRelease(direction), 120)
      }
    }}
  >{children}</button>
}
