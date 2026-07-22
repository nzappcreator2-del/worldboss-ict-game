import type { CSSProperties } from 'react'
import type { WalkDirection } from './dashboardCharacter'
import type { LessonEnemyMode, LessonMonsterBody } from './lessonCombatLogic'
import type { LessonMonsterSkinKey } from './lessonMapSets'
import { monsterAnimationFor } from './lessonMonsterAnimation'

// Hand-drawn SVG pixel art for the RO-style field monsters that don't use the LPC archer
// spritesheet — no licensed Ragnarok/Gravity assets involved. Each grid cell maps to one
// palette color; '.' stays transparent. Facing left is a horizontal flip, not a redraw.
type PixelGridProps = { rows: string[]; palette: Record<string, string>; x?: number; y?: number }

function PixelGrid({ rows, palette, x = 0, y = 0 }: PixelGridProps) {
  return (
    <>
      {rows.map((row, rowIndex) => [...row].map((char, colIndex) => {
        const color = palette[char]
        if (!color) return null
        return <rect key={`${rowIndex}-${colIndex}`} x={x + colIndex} y={y + rowIndex} width={1} height={1} fill={color} />
      }))}
    </>
  )
}

const SLIME_PALETTE = { G: '#4ade80', D: '#15803d', H: '#dcfce7', K: '#052e16' }
const SLIME_ROWS = [
  '....GGGGGG....',
  '..GGGGGGGGGG..',
  '.GGGHGGGGGGGG.',
  'GGGGGGGGGGGGGG',
  'GGKGGGGGGGKGGG',
  'GGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGG',
  '.GGGGGGGGGGGG.',
  '.DDDDDDDDDDDD.',
  '..DDDDDDDDDD..',
]

const MUSHROOM_PALETTE = { R: '#e11d48', W: '#fff1f2', S: '#fde68a', K: '#3f1d0f' }
const MUSHROOM_ROWS = [
  '....RRRRRR....',
  '..RRRRRRRRRR..',
  '.RRRWRRRRRWRR.',
  'RRRRRRWRRRRRRR',
  'RRRRRRRRRRRRRR',
  '.SSSSSSSSSSSS.',
  '..SKSS..SSKS..',
  '..SSSS..SSSS..',
  '..SSSS..SSSS..',
]

const BAT_PALETTE = { B: '#6d28d9', E: '#fde047', K: '#1e1033' }
const BAT_BODY_ROWS = [
  '..BBBB..',
  '.BBBBBB.',
  'BBEBBEBB',
  'BBBBBBBB',
  '.BBKKBB.',
  '..BBBB..',
]
const BAT_WING_ROWS = [
  '...B',
  '..BB',
  '.BBB',
  'BBBB',
  '.BB.',
]

const TOME_PALETTE = { C: '#7c2d12', P: '#fef3c7', G: '#facc15', F: '#fb923c', Y: '#fef9c3' }
const TOME_ROWS = [
  'CCCCCCCCCCCC',
  'CPPPPPPPPPPC',
  'CPGPPPPPPGPC',
  'CPPPPPPPPPPC',
  'CPPPPPPPPPPC',
  'CCCCCCCCCCCC',
]
const FLAME_ROWS = [
  '..F..',
  '.FYF.',
  'FYYYF',
  '.FYF.',
  '..F..',
]

type Props = { body: Exclude<LessonMonsterBody, 'lpc-archer'>; mode: LessonEnemyMode; direction: WalkDirection }

export function LessonMonsterSprite({ body, direction }: Props) {
  const flipped = direction === 'left'
  const style = flipped ? { transform: 'scaleX(-1)' } : undefined

  if (body === 'slime') {
    return (
      <svg viewBox="0 0 14 10" data-body="slime" shapeRendering="crispEdges" className="lesson-svg-slime" style={style} aria-hidden="true">
        <PixelGrid rows={SLIME_ROWS} palette={SLIME_PALETTE} />
      </svg>
    )
  }

  if (body === 'mushroom') {
    return (
      <svg viewBox="0 0 14 9" data-body="mushroom" shapeRendering="crispEdges" className="lesson-svg-mushroom" style={style} aria-hidden="true">
        <PixelGrid rows={MUSHROOM_ROWS} palette={MUSHROOM_PALETTE} />
      </svg>
    )
  }

  if (body === 'bat') {
    return (
      <svg viewBox="0 0 16 6" data-body="bat" shapeRendering="crispEdges" className="lesson-svg-bat" style={style} aria-hidden="true">
        <g className="lesson-svg-wing lesson-svg-wing-left" transform="translate(4,0.5)">
          <PixelGrid rows={BAT_WING_ROWS} palette={BAT_PALETTE} />
        </g>
        <PixelGrid rows={BAT_BODY_ROWS} palette={BAT_PALETTE} x={4} />
        <g className="lesson-svg-wing lesson-svg-wing-right" transform="translate(12,0.5)">
          <PixelGrid rows={BAT_WING_ROWS} palette={BAT_PALETTE} />
        </g>
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 12 11" data-body="tome" shapeRendering="crispEdges" className="lesson-svg-tome" style={style} aria-hidden="true">
      <g className="lesson-svg-flame" transform="translate(3.5,0)">
        <PixelGrid rows={FLAME_ROWS} palette={TOME_PALETTE} />
      </g>
      <PixelGrid rows={TOME_ROWS} palette={TOME_PALETTE} y={5} />
    </svg>
  )
}

export function LessonAssetMonsterSprite({ skin, mode, direction, frame, renderSize = 136 }: { skin: LessonMonsterSkinKey; mode: LessonEnemyMode; direction: WalkDirection; frame: number; renderSize?: number }) {
  const animation = monsterAnimationFor(skin, mode)
  const frameIndex = Math.abs(Math.floor(frame || 0)) % animation.frames
  const renderWidth = renderSize
  const renderHeight = renderWidth * (animation.frameHeight / animation.frameWidth)
  const style: CSSProperties = {
    backgroundImage: `url(${animation.image})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${animation.frames * renderWidth}px ${renderHeight}px`,
    backgroundPosition: `${-frameIndex * renderWidth}px bottom`,
    transform: direction === 'left' ? 'scaleX(-1)' : undefined,
    width: renderSize,
    height: renderSize,
    display: 'block',
  }
  return <span className="lesson-asset-monster-sprite" data-monster-skin={skin} data-animation={animation.animation} data-frames={animation.frames} data-render-size={renderSize} style={style} aria-hidden="true" />
}
