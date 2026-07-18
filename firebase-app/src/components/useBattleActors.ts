import { useCallback, useEffect, useRef, useState } from 'react'
import {
  TEST_CHARACTER_SPRITE,
  directionTowardTarget,
  moveCharacter,
  moveTowardTarget,
  movementStepForElapsed,
  pointerToWalkPosition,
  type CharacterPosition,
  type WalkDirection,
} from './dashboardCharacter'
import { updateBossCombatStep } from './bossCombatLogic'

export type PlayerActorAction = 'idle' | 'walk' | 'attack' | 'hurt'
export type BossActorAction = 'idle' | 'walk' | 'attack'

export const PLAYER_ATTACK_FRAME_COLUMNS = [1, 4, 7, 10, 13, 16] as const
const BOSS_WALK_FRAME_COUNT = 9
const BOSS_ATTACK_FRAME_COUNT = 6
const PLAYER_MOVE_SPEED = 18
const BOSS_MOVE_SPEED = 12
const WALK_FRAME_INTERVAL_MS = 110
const MOVE_TICK_MS = 16
const ATTACK_FRAME_INTERVAL_MS = 80

// Owns the arena actor state machines (player walking/attacking, boss chasing)
// so the battle component only orchestrates game rules and rendering.
export function useBattleActors({ active, playerStart, bossStart, attackRange }: {
  active: boolean
  playerStart: CharacterPosition
  bossStart: CharacterPosition
  attackRange: number
}) {
  const [position, setPosition] = useState<CharacterPosition>(playerStart)
  const [direction, setDirection] = useState<WalkDirection>('right')
  const [frame, setFrame] = useState(0)
  const [playerAction, setPlayerAction] = useState<PlayerActorAction>('idle')
  const [bossPosition, setBossPosition] = useState<CharacterPosition>(bossStart)
  const [bossDirection, setBossDirection] = useState<WalkDirection>('left')
  const [bossFrame, setBossFrame] = useState(0)
  const [bossAction, setBossAction] = useState<BossActorAction>('idle')
  const worldRef = useRef<HTMLDivElement>(null)
  const positionRef = useRef(position)
  const bossPositionRef = useRef(bossPosition)
  const bossActionRef = useRef(bossAction)
  const heldMoveTimer = useRef<number | null>(null)
  const heldFrameTimer = useRef<number | null>(null)
  const pointerMoveTimer = useRef<number | null>(null)
  const pointerFrameTimer = useRef<number | null>(null)
  const attackAnimationTimer = useRef<number | null>(null)
  const bossAttackAnimationTimer = useRef<number | null>(null)
  const heldDirection = useRef<WalkDirection | null>(null)
  positionRef.current = position
  bossPositionRef.current = bossPosition
  bossActionRef.current = bossAction

  const stopPointerMove = useCallback((resetFrame = true) => {
    if (pointerMoveTimer.current !== null) window.clearInterval(pointerMoveTimer.current)
    if (pointerFrameTimer.current !== null) window.clearInterval(pointerFrameTimer.current)
    pointerMoveTimer.current = null
    pointerFrameTimer.current = null
    if (resetFrame) {
      setPlayerAction('idle')
      setFrame(0)
    }
  }, [])

  const stopHeldMove = useCallback((resetFrame = true) => {
    if (heldMoveTimer.current !== null) window.clearInterval(heldMoveTimer.current)
    if (heldFrameTimer.current !== null) window.clearInterval(heldFrameTimer.current)
    heldMoveTimer.current = null
    heldFrameTimer.current = null
    heldDirection.current = null
    if (resetFrame) {
      setPlayerAction('idle')
      setFrame(0)
    }
  }, [])

  const stepHeldMove = useCallback((nextDirection: WalkDirection, elapsedMs = MOVE_TICK_MS) => {
    setDirection(nextDirection)
    setPosition((current) => {
      const next = moveCharacter(current, nextDirection, movementStepForElapsed(elapsedMs, PLAYER_MOVE_SPEED))
      positionRef.current = next
      return next
    })
    setPlayerAction('walk')
  }, [])

  const startHeldMove = useCallback((nextDirection: WalkDirection) => {
    if (!active) return
    stopPointerMove(false)
    if (heldDirection.current === nextDirection && heldMoveTimer.current !== null) return
    stopHeldMove()
    heldDirection.current = nextDirection
    setDirection(nextDirection)
    setPlayerAction('walk')
    heldMoveTimer.current = window.setInterval(() => {
      const activeDirection = heldDirection.current
      if (activeDirection) stepHeldMove(activeDirection)
    }, MOVE_TICK_MS)
    heldFrameTimer.current = window.setInterval(() => {
      setFrame((current) => (current + 1) % TEST_CHARACTER_SPRITE.walkFrames.length)
    }, WALK_FRAME_INTERVAL_MS)
  }, [active, stepHeldMove, stopHeldMove, stopPointerMove])

  const walkToClientPoint = useCallback((clientX: number, clientY: number, fallbackElement: HTMLElement) => {
    if (!active) return
    const rect = worldRef.current?.getBoundingClientRect() ?? fallbackElement.getBoundingClientRect()
    const safeClientX = Number.isFinite(clientX) ? clientX : rect.left + rect.width / 2
    const safeClientY = Number.isFinite(clientY) ? clientY : rect.top + rect.height / 2
    const target = pointerToWalkPosition(safeClientX, safeClientY, rect)
    stopHeldMove()
    stopPointerMove(false)
    const stepToTarget = () => {
      const current = positionRef.current
      const nextDirection = directionTowardTarget(current, target)
      const result = moveTowardTarget(current, target, movementStepForElapsed(MOVE_TICK_MS, PLAYER_MOVE_SPEED))
      positionRef.current = result.position
      setDirection(nextDirection)
      setPosition(result.position)
      setPlayerAction(result.reached ? 'idle' : 'walk')
      if (result.reached) stopPointerMove()
    }
    stepToTarget()
    pointerMoveTimer.current = window.setInterval(stepToTarget, MOVE_TICK_MS)
    pointerFrameTimer.current = window.setInterval(() => {
      setFrame((current) => (current + 1) % TEST_CHARACTER_SPRITE.walkFrames.length)
    }, WALK_FRAME_INTERVAL_MS)
    setPlayerAction('walk')
  }, [active, stopHeldMove, stopPointerMove])

  const playAttackAnimation = useCallback((facing: WalkDirection) => {
    stopHeldMove()
    stopPointerMove(false)
    setDirection(facing)
    setPlayerAction('attack')
    setFrame(0)
    if (attackAnimationTimer.current !== null) window.clearInterval(attackAnimationTimer.current)
    let attackFrame = 0
    attackAnimationTimer.current = window.setInterval(() => {
      attackFrame += 1
      setFrame(attackFrame)
      if (attackFrame >= PLAYER_ATTACK_FRAME_COLUMNS.length - 1) {
        if (attackAnimationTimer.current !== null) window.clearInterval(attackAnimationTimer.current)
        attackAnimationTimer.current = null
        setPlayerAction('idle')
        setFrame(0)
      }
    }, ATTACK_FRAME_INTERVAL_MS)
  }, [stopHeldMove, stopPointerMove])

  const playBossAttackAnimation = useCallback((facing: WalkDirection) => {
    setBossDirection(facing)
    setBossAction('attack')
    setBossFrame(0)
    if (bossAttackAnimationTimer.current !== null) window.clearInterval(bossAttackAnimationTimer.current)
    let attackFrame = 0
    bossAttackAnimationTimer.current = window.setInterval(() => {
      attackFrame += 1
      setBossFrame(attackFrame)
      if (attackFrame >= BOSS_ATTACK_FRAME_COUNT - 1) {
        if (bossAttackAnimationTimer.current !== null) window.clearInterval(bossAttackAnimationTimer.current)
        bossAttackAnimationTimer.current = null
        setBossAction('idle')
        setBossFrame(0)
      }
    }, ATTACK_FRAME_INTERVAL_MS)
  }, [])

  const reset = useCallback(() => {
    stopHeldMove(false)
    stopPointerMove(false)
    if (attackAnimationTimer.current !== null) window.clearInterval(attackAnimationTimer.current)
    if (bossAttackAnimationTimer.current !== null) window.clearInterval(bossAttackAnimationTimer.current)
    attackAnimationTimer.current = null
    bossAttackAnimationTimer.current = null
    setPosition(playerStart)
    positionRef.current = playerStart
    setDirection('right')
    setFrame(0)
    setPlayerAction('idle')
    setBossPosition(bossStart)
    bossPositionRef.current = bossStart
    setBossDirection('left')
    setBossFrame(0)
    setBossAction('idle')
  }, [bossStart, playerStart, stopHeldMove, stopPointerMove])

  // Boss chases the player while the arena is active.
  useEffect(() => {
    if (!active) return

    const moveTimer = window.setInterval(() => {
      const bossPos = bossPositionRef.current
      const playerPos = positionRef.current
      const step = movementStepForElapsed(MOVE_TICK_MS, BOSS_MOVE_SPEED)
      const result = updateBossCombatStep(bossPos, playerPos, attackRange, step)

      if (result.action === 'walk') {
        setBossAction('walk')
        setBossDirection(result.direction)
        setBossPosition(result.position)
        bossPositionRef.current = result.position
      } else {
        if (bossAttackAnimationTimer.current === null) {
          setBossAction('idle')
          setBossDirection(result.direction)
        }
      }
    }, MOVE_TICK_MS)

    const frameTimer = window.setInterval(() => {
      if (bossActionRef.current === 'walk') {
        setBossFrame((current) => (current + 1) % BOSS_WALK_FRAME_COUNT)
      }
    }, WALK_FRAME_INTERVAL_MS)

    return () => {
      window.clearInterval(moveTimer)
      window.clearInterval(frameTimer)
      if (bossAttackAnimationTimer.current !== null) {
        window.clearInterval(bossAttackAnimationTimer.current)
        bossAttackAnimationTimer.current = null
      }
      setBossAction('idle')
      setBossFrame(0)
    }
  }, [active, attackRange])

  // Freeze player movement whenever the arena stops being interactive.
  useEffect(() => {
    if (!active) {
      stopHeldMove()
      stopPointerMove()
    }
  }, [active, stopHeldMove, stopPointerMove])

  useEffect(() => () => {
    if (heldMoveTimer.current !== null) window.clearInterval(heldMoveTimer.current)
    if (heldFrameTimer.current !== null) window.clearInterval(heldFrameTimer.current)
    if (pointerMoveTimer.current !== null) window.clearInterval(pointerMoveTimer.current)
    if (pointerFrameTimer.current !== null) window.clearInterval(pointerFrameTimer.current)
    if (attackAnimationTimer.current !== null) window.clearInterval(attackAnimationTimer.current)
    if (bossAttackAnimationTimer.current !== null) window.clearInterval(bossAttackAnimationTimer.current)
  }, [])

  return {
    worldRef,
    position,
    direction,
    frame,
    playerAction,
    bossPosition,
    bossDirection,
    bossFrame,
    bossAction,
    positionRef,
    bossPositionRef,
    heldDirectionRef: heldDirection,
    startHeldMove,
    stopHeldMove,
    stopPointerMove,
    walkToClientPoint,
    playAttackAnimation,
    playBossAttackAnimation,
    reset,
  }
}
