import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import archerSprite from '../assets/lesson-shadow-archer.png'
import warriorSprite from '../assets/lesson-corrupted-warrior.png'
import {
  DEFAULT_CHARACTER_POSITION,
  TEST_CHARACTER_SPRITE,
  directionForKey,
  directionTowardTarget,
  moveCharacter,
  moveTowardTarget,
  movementElapsedForFrame,
  movementStepForElapsed,
  pointerToWalkPosition,
  spriteBackgroundPosition,
  type CharacterPosition,
  type WalkDirection,
} from './dashboardCharacter'
import {
  AUTO_ATTACK_COOLDOWN_MS,
  autoMovementStepForFrame,
  decideAutoBattle,
} from './autoBattleLogic'
import {
  completedLessonQuests,
  createLessonAdventure,
  defeatLessonMonster,
  finishLessonVideo,
  lessonKillQuestDone,
  lessonQuestObjectives,
  lessonZoneQuestDone,
  readLessonNote,
  useLessonPortal,
  type LessonAdventureProgress,
} from './lessonAdventureLogic'
import {
  LESSON_COMBO_WINDOW_MS,
  LESSON_ENEMY_RESPAWN_TICKS,
  LESSON_MELEE_ENGAGE_RANGE,
  LESSON_MONSTER_SPECIES,
  LESSON_PLAYER_ATTACK_RANGE,
  LESSON_PLAYER_BASE_DAMAGE,
  LESSON_SKILL_ATTACK_RANGE,
  LESSON_SKILL_MULTIPLIER,
  advanceCombo,
  createLessonEnemy,
  killXpReward,
  respawnLessonEnemy,
  rollPlayerStrike,
  selectEnemyInAttackRange,
  stepLessonBoss,
  stepLessonEnemy,
  type LessonCombo,
  type LessonEnemy,
} from './lessonCombatLogic'
import {
  LESSON_CAMERA_SCALE,
  LESSON_CARD_ATTACK_BONUS,
  LESSON_PICKUP_RANGE,
  LESSON_PORTAL_WARP_RANGE,
  LESSON_WALK_BOUNDS,
  LESSON_ZONE_CONFIGS,
  LOOT_INFO,
  addToBag,
  cameraOffset,
  guideAngleDeg,
  isWithinRange,
  rollLoot,
  takeFromBag,
  type BagItem,
  type GroundDrop,
  type LootRarity,
} from './lessonWorldLogic'
import { hasLessonVideo, hasTrackableLessonVideo, isDirectLessonVideo, lessonVideoMessageEnded, toTrackedLessonEmbedUrl } from './lessonMedia'
import { QuizQuestionView, type QuizQuestion } from './QuizQuestionView'
import { applyBattleAnswer, applySkirmishExchange, battleOutcome, selectBossSkillQuestionIndex, skirmishBossDamagePerTick, starsForScore, type BattleState } from './quizLogic'
import { HERO_BASE_MAX_HP, heroCombatProfile, type HeroCombatProfile } from '../services/heroStats'
import { characterLayerImages } from './characterAssets'
import { levelForXp, levelProgress } from '../services/levelSystem'
import { playSwordHit, setLessonMusic } from '../services/gameAudio'
import { LessonAssetMonsterSprite, LessonMonsterSprite } from './LessonMonsterSprites'
import { LESSON_BAR_BADGE_IMAGES, LESSON_CHEST_IMAGES, LESSON_DEATH_PANEL_IMAGES, LESSON_HOTBAR_IMAGES, LESSON_LOOT_IMAGES, LESSON_SCROLL_IMAGE, LESSON_STAT_IMAGES } from './lessonUiAssets'
import { VirtualJoystick } from './VirtualJoystick'
import { LEGACY_LESSON_MAP_SET, MONSTER_SKIN_NAMES, monsterSkinForSpawn, resolveLessonMapSet, type LessonMapSet } from './lessonMapSets'
import { TeacherQuestTracker } from './TeacherQuestTracker'
import { trackedQuest, type StudentQuestView } from '../services/teacherQuestLogic'

export type Lesson = {
  id: string
  title: string
  description?: string
  content?: string
  videoUrl?: string
  icon?: string
  enablePretest?: boolean
  worksheetUrl?: string
  lessonMapSet?: string
}

type LessonBattleUser = {
  id: string
  avatar?: string
  gender?: string
  xp: number
  coins: number
  level: number
  rank: string
  passedLessons?: string[]
  inventory?: { potion?: number; magnifier?: number; stats?: unknown; cosmetics?: unknown }
}
type ProgressStats = { xp: number; coins?: number; level: number; rank: string; gainedXp: number; alreadyPassed: boolean }
type AdventureRewardStats = { xp: number; coins: number; level: number; rank: string; gainedXp: number; gainedCoins: number }
type Result<T> = { success: boolean; data?: T; error?: string }

export type LessonService = {
  getCurrentLesson(): Lesson | null
  getCurrentUser?(): LessonBattleUser | null
  getTimerPerQuestion?(): number
  loadQuestions?(lessonId: string): Promise<Result<QuizQuestion[]>>
  saveProgress?(userId: string, lessonId: string, status: 'Passed' | 'Failed', score: number, maxScore: number): Promise<{ success: boolean; stats?: ProgressStats; error?: string }>
  saveAdventureRewards?(userId: string, xpGain: number, coinGain: number): Promise<{ success: boolean; skipped?: boolean; stats?: AdventureRewardStats; error?: string }>
  trackDailyProgress?(type: 'play1' | 'correct5', questionId?: string): void
  /** Marks any accepted teacher quest for this lesson as studied. */
  markLessonStudied?(lessonId: string): Promise<unknown>
  /** Full teacher-quest board — drives the persistent tracker widget. */
  loadQuestBoard?(userId: string): Promise<{ success: boolean; data?: StudentQuestView[] }>
}

type Props = {
  service: LessonService
  onBack(): void
  onStartQuiz(): void
  onOpenWorksheet(): void
  onUserUpdate?(user: LessonUserUpdate): void
  onExitGame?(): void
  /** Returns to the hub and opens the teacher NPC, e.g. from the tracker widget. */
  onOpenNpc?(): void
  random?: () => number
  videoUnlockMs?: number
}

type LessonUserUpdate = Partial<LessonBattleUser> & Partial<ProgressStats>
type BossFightPhase = 'idle' | 'loading' | 'skirmish' | 'question' | 'result' | 'error'
type BossFightResult = { passed: boolean; percent: number; score: number; total: number; stars: number; reason: string; stats?: ProgressStats; saveError?: string }

const questTitles = {
  1: 'เควส 1: ตามหาโน้ตความรู้',
  2: 'เควส 2: ค้นหาตู้วิดีโอลับ',
  3: 'เควส 3: ปราบผู้พิทักษ์บทเรียน',
} as const

// Zone 2 is named after its side quest, so a lesson with no video needs a title
// that describes what the student is actually there to do.
const QUEST_TITLE_ZONE2_NO_VIDEO = 'เควส 2: เคลียร์หอจดหมายเหตุ'

const questTitleFor = (progress: LessonAdventureProgress) =>
  progress.zone === 2 && !progress.hasVideo ? QUEST_TITLE_ZONE2_NO_VIDEO : questTitles[progress.zone]

const createZoneEnemies = (zone: 1 | 2, mapSet: LessonMapSet = LEGACY_LESSON_MAP_SET): LessonEnemy[] =>
  LESSON_ZONE_CONFIGS[zone].enemySpawns.map((spawn, index) =>
    createLessonEnemy(index + 1, spawn, LESSON_MONSTER_SPECIES[spawn.species], monsterSkinForSpawn(mapSet, zone, index)))

const attackRows: Record<WalkDirection, number> = { up: 55, left: 58, down: 61, right: 64 }
const attackFrameColumns = [1, 4, 7, 10, 13, 16] as const
const enemyWalkRows: Record<WalkDirection, number> = { up: 8, left: 9, down: 10, right: 11 }
const enemyAttackRows: Record<WalkDirection, number> = { up: 16, left: 17, down: 18, right: 19 }
const LESSON_BOSS_POSITION: CharacterPosition = { x: 50, y: 43 }
// Swing registration vs walk-up distance, same split as the field monsters:
// the auto-bot (and a chasing player) closes to ENGAGE before attacking, and
// the 7-unit registration mirrors the boss's own melee reach.
const LESSON_BOSS_ATTACK_RANGE = 7
const LESSON_BOSS_ENGAGE_RANGE = 4.5
const LESSON_BOSS_MELEE_RANGE = 7
const BOSS_SWING_WINDUP_MS = 320
const BOSS_SWING_COOLDOWN_MS = 650
const BOSS_SWING_FRAME_MS = 90
const BOSS_SWING_CONTACT_FRAME = 3
const BOSS_STRIKE_DAMAGE = 6
const BOSS_HITS_PER_QUESTION = 3
const LESSON_SP_MAX = 100
const LESSON_SKILL_SP_COST = 25
const LESSON_SP_REGEN = 2
const LESSON_SP_REGEN_MS = 400
const LESSON_LOOT_FEED_MS = 4200
const LESSON_HIT_SPARK_MS = 450
const LESSON_SHAKE_MS = 300
// Let the death animation play before the RO-style revive choice panel appears.
const LESSON_DEATH_REVEAL_MS = 900
const BOSS_MIN_STARTING_PLAYER_HP = 70
const BOSS_SPRITE_COLUMNS = 24
const BOSS_SPRITE_ROWS = 90
const BOSS_SPRITE_RENDER_SIZE = 240
const BOSS_SPRITE_IDLE_ROW = 10
const BOSS_WALK_ROWS: Record<WalkDirection, number> = { up: 8, left: 9, down: 10, right: 11 }
const BOSS_ATTACK_ROWS: Record<WalkDirection, number> = { up: 12, left: 13, down: 14, right: 15 }
const BOSS_WALK_FRAME_COUNT = 9
const BOSS_ATTACK_FRAME_COUNT = 6
const createBossBattleState = (playerHp = 100): BattleState => ({ bossHp: 100, playerHp, score: 0, combo: 1 })

export function LessonPage({ service, onBack, onStartQuiz, onOpenWorksheet, onUserUpdate, onExitGame, onOpenNpc, random = Math.random, videoUnlockMs }: Props) {
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [trackedTeacherQuest, setTrackedTeacherQuest] = useState<StudentQuestView | null>(null)
  const activeMapSet = lesson ? resolveLessonMapSet(lesson.lessonMapSet, lesson.id) : LEGACY_LESSON_MAP_SET
  const [progress, setProgress] = useState(createLessonAdventure)
  const [enemies, setEnemies] = useState<LessonEnemy[]>(() => createZoneEnemies(1))
  const [playerHp, setPlayerHp] = useState(100)
  const [heroMaxHp, setHeroMaxHp] = useState(HERO_BASE_MAX_HP)
  const [heroXp, setHeroXp] = useState(0)
  const [levelUpLevel, setLevelUpLevel] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const [charOpen, setCharOpen] = useState(false)
  const heroProfileRef = useRef<HeroCombatProfile>(heroCombatProfile(undefined))
  const [bossPhase, setBossPhase] = useState<BossFightPhase>('idle')
  const [bossQuestions, setBossQuestions] = useState<QuizQuestion[]>([])
  const [bossQuestionIndex, setBossQuestionIndex] = useState(0)
  const [bossRemainingQuestionIndexes, setBossRemainingQuestionIndexes] = useState<number[]>([])
  const [bossBattle, setBossBattle] = useState<BattleState>(() => createBossBattleState())
  const [bossHits, setBossHits] = useState(0)
  const [bossUser, setBossUser] = useState<LessonBattleUser | null>(null)
  const [heroUser, setHeroUser] = useState<LessonBattleUser | null>(null)
  const [bossError, setBossError] = useState('')
  const [bossImpact, setBossImpact] = useState<'player' | 'boss' | null>(null)
  const [bossResult, setBossResult] = useState<BossFightResult | null>(null)
  const [bossPosition, setBossPosition] = useState<CharacterPosition>(LESSON_BOSS_POSITION)
  const [bossAction, setBossAction] = useState<'walk' | 'ready' | 'swing'>('ready')
  const [bossDirection, setBossDirection] = useState<WalkDirection>('down')
  const [bossFrame, setBossFrame] = useState(0)
  const [floatingTexts, setFloatingTexts] = useState<{ id: number; x: number; y: number; text: string; kind: 'deal' | 'take' | 'gain' | 'crit' }[]>([])
  const [hitSparks, setHitSparks] = useState<{ id: number; x: number; y: number; crit: boolean }[]>([])
  const [lootFeed, setLootFeed] = useState<{ id: number; kind: GroundDrop['kind']; text: string; rarity: LootRarity }[]>([])
  const [drops, setDrops] = useState<GroundDrop[]>([])
  const [bag, setBag] = useState<BagItem[]>([])
  const [bagOpen, setBagOpen] = useState(false)
  const [questOpen, setQuestOpen] = useState(false)
  const [sp, setSp] = useState(LESSON_SP_MAX)
  const [atkBonus, setAtkBonus] = useState(0)
  const [combo, setCombo] = useState<LessonCombo>({ count: 0, lastHitAt: 0 })
  const [shaking, setShaking] = useState(false)
  const [notePickup, setNotePickup] = useState<CharacterPosition | null>(null)
  const [playerAction, setPlayerAction] = useState<'idle' | 'walk' | 'attack' | 'hurt' | 'dead'>('idle')
  const [playerDead, setPlayerDead] = useState(false)
  const [deathChoiceOpen, setDeathChoiceOpen] = useState(false)
  const [combatNotice, setCombatNotice] = useState('')
  const [autoBattle, setAutoBattle] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [position, setPosition] = useState<CharacterPosition>(DEFAULT_CHARACTER_POSITION)
  const [direction, setDirection] = useState<WalkDirection>('down')
  const [frame, setFrame] = useState(0)
  const worldRef = useRef<HTMLDivElement>(null)
  const videoFrameRef = useRef<HTMLIFrameElement>(null)
  const positionRef = useRef(position)
  const bossPositionRef = useRef(bossPosition)
  const bossActionRef = useRef(bossAction)
  const bossEngagedRef = useRef(false)
  const bossSwingTimer = useRef<number | null>(null)
  const bossSwingCooldownTimer = useRef<number | null>(null)
  const bossStrikeRef = useRef<() => void>(() => undefined)
  const floatingTextIdRef = useRef(0)
  const hitSparkIdRef = useRef(0)
  const lootFeedIdRef = useRef(0)
  const dropsRef = useRef<GroundDrop[]>([])
  const dropIdRef = useRef(0)
  const bagRef = useRef<BagItem[]>([])
  const spRef = useRef(LESSON_SP_MAX)
  const atkBonusRef = useRef(0)
  const comboTimer = useRef<number | null>(null)
  const shakeTimer = useRef<number | null>(null)
  const playerDeadRef = useRef(false)
  const deathChoiceTimer = useRef<number | null>(null)
  const heroXpRef = useRef(0)
  const heroUserRef = useRef<LessonBattleUser | null>(null)
  const sessionXpRef = useRef(0)
  const sessionCoinsRef = useRef(0)
  const comboRef = useRef<LessonCombo>({ count: 0, lastHitAt: 0 })
  const levelUpTimer = useRef<number | null>(null)
  // Holds the lesson id whose run is paused under the worksheet page; the next
  // nextgen:open-lesson resumes that run ONLY for the same lesson — opening any
  // other lesson (or re-entering after leaving) always starts fresh, so a
  // dangling pause can never leak a finished boss screen into the next stage.
  const worksheetPausedRef = useRef<string | null>(null)
  const pausedRef = useRef(false)
  // Ephemeral combat-float/spark/loot-toast cleanup timers: tracked so unmount can cancel them all.
  const ephemeralTimers = useRef<Set<number>>(new Set())
  const enterZoneRef = useRef<(zone: 2 | 3) => void>(() => undefined)
  const progressRef = useRef(progress)
  const enemiesRef = useRef(enemies)
  const playerHpRef = useRef(playerHp)
  const attackAnimationRef = useRef<number | null>(null)
  const heldMoveTimer = useRef<number | null>(null)
  const heldFrameTimer = useRef<number | null>(null)
  const pointerMoveTimer = useRef<number | null>(null)
  const pointerFrameTimer = useRef<number | null>(null)
  const heldDirection = useRef<WalkDirection | null>(null)
  const chaseEnemyIdRef = useRef<number | null>(null)
  const attackActionRef = useRef<() => void>(() => undefined)
  const skillActionRef = useRef<() => void>(() => undefined)
  const potionActionRef = useRef<() => void>(() => undefined)
  const cardActionRef = useRef<() => void>(() => undefined)
  const autoToggleRef = useRef<() => void>(() => undefined)
  const autoAttackLastRef = useRef(0)
  const autoWalkAnimRef = useRef(0)
  const playerActionRef = useRef(playerAction)
  positionRef.current = position
  spRef.current = sp
  atkBonusRef.current = atkBonus
  bossPositionRef.current = bossPosition
  bossActionRef.current = bossAction
  enemiesRef.current = enemies
  playerHpRef.current = playerHp
  playerActionRef.current = playerAction
  playerDeadRef.current = playerDead
  dropsRef.current = drops
  bagRef.current = bag
  progressRef.current = progress
  comboRef.current = combo
  pausedRef.current = paused
  heroUserRef.current = heroUser

  const setPlayerActionState = useCallback((nextAction: typeof playerAction) => {
    playerActionRef.current = nextAction
    setPlayerAction(nextAction)
  }, [])

  const spawnFloatingText = useCallback((x: number, y: number, text: string, kind: 'deal' | 'take' | 'gain' | 'crit') => {
    floatingTextIdRef.current += 1
    const id = floatingTextIdRef.current
    setFloatingTexts((current) => [...current.slice(-11), { id, x, y, text, kind }])
    const timeoutId = window.setTimeout(() => {
      ephemeralTimers.current.delete(timeoutId)
      setFloatingTexts((current) => current.filter((entry) => entry.id !== id))
    }, 800)
    ephemeralTimers.current.add(timeoutId)
  }, [])

  const spawnHitSpark = useCallback((x: number, y: number, crit: boolean) => {
    hitSparkIdRef.current += 1
    const id = hitSparkIdRef.current
    setHitSparks((current) => [...current.slice(-5), { id, x, y, crit }])
    const timeoutId = window.setTimeout(() => {
      ephemeralTimers.current.delete(timeoutId)
      setHitSparks((current) => current.filter((entry) => entry.id !== id))
    }, LESSON_HIT_SPARK_MS)
    ephemeralTimers.current.add(timeoutId)
  }, [])

  const pushLootFeed = useCallback((kind: GroundDrop['kind'], amount: number) => {
    const info = LOOT_INFO[kind]
    lootFeedIdRef.current += 1
    const id = lootFeedIdRef.current
    setLootFeed((current) => [...current.slice(-3), { id, kind, text: `${info.label} x${amount}`, rarity: info.rarity }])
    const timeoutId = window.setTimeout(() => {
      ephemeralTimers.current.delete(timeoutId)
      setLootFeed((current) => current.filter((entry) => entry.id !== id))
    }, LESSON_LOOT_FEED_MS)
    ephemeralTimers.current.add(timeoutId)
  }, [])

  const triggerShake = useCallback(() => {
    if (shakeTimer.current !== null) window.clearTimeout(shakeTimer.current)
    setShaking(true)
    shakeTimer.current = window.setTimeout(() => {
      shakeTimer.current = null
      setShaking(false)
    }, LESSON_SHAKE_MS)
  }, [])

  const triggerDeath = useCallback(() => {
    playerDeadRef.current = true
    chaseEnemyIdRef.current = null
    setPlayerDead(true)
    setPlayerActionState('dead')
    setCombatNotice('')
    if (deathChoiceTimer.current !== null) window.clearTimeout(deathChoiceTimer.current)
    deathChoiceTimer.current = window.setTimeout(() => {
      deathChoiceTimer.current = null
      setDeathChoiceOpen(true)
    }, LESSON_DEATH_REVEAL_MS)
  }, [setPlayerActionState])

  const registerCombo = useCallback(() => {
    const now = Date.now()
    setCombo((current) => advanceCombo(current, now))
    if (comboTimer.current !== null) window.clearTimeout(comboTimer.current)
    comboTimer.current = window.setTimeout(() => {
      comboTimer.current = null
      setCombo({ count: 0, lastHitAt: 0 })
    }, LESSON_COMBO_WINDOW_MS)
  }, [])

  // Persist unsaved kill XP / picked-up coins. Fire-and-forget on zone changes and
  // exits; the refs are restored on failure so a later flush can retry the amount.
  const flushSessionRewards = useCallback(async () => {
    const xpGain = sessionXpRef.current
    const coinGain = sessionCoinsRef.current
    if (xpGain <= 0 && coinGain <= 0) return
    sessionXpRef.current = 0
    sessionCoinsRef.current = 0
    const heroId = heroUserRef.current?.id
    if (!heroId || !service.saveAdventureRewards) return
    try {
      const saved = await service.saveAdventureRewards(heroId, xpGain, coinGain)
      if (saved.success && saved.stats) onUserUpdate?.(saved.stats)
      else throw new Error(saved.error || 'flush failed')
    } catch {
      sessionXpRef.current += xpGain
      sessionCoinsRef.current += coinGain
    }
  }, [onUserUpdate, service])

  const triggerLevelUp = useCallback((newLevel: number) => {
    const healCap = progressRef.current.zone === 3 ? 100 : heroProfileRef.current.maxHp
    playerHpRef.current = healCap
    setPlayerHp(healCap)
    if (progressRef.current.zone === 3) setBossBattle((current) => ({ ...current, playerHp: healCap }))
    setLevelUpLevel(newLevel)
    setCombatNotice(`เลเวลอัพเป็น Lv.${newLevel}! พลังชีวิตฟื้นเต็ม รับแต้มสเตตัส +3 ที่หน้าโปรไฟล์`)
    // The new level must stick to the character outside this map: sync the bridge
    // user optimistically and persist right away instead of waiting for an exit.
    onUserUpdate?.({ xp: heroXpRef.current, level: newLevel })
    void flushSessionRewards()
    if (levelUpTimer.current !== null) window.clearTimeout(levelUpTimer.current)
    levelUpTimer.current = window.setTimeout(() => {
      levelUpTimer.current = null
      setLevelUpLevel(null)
    }, 2400)
  }, [flushSessionRewards, onUserUpdate])

  const grantKillXp = useCallback((enemy: LessonEnemy) => {
    const gained = killXpReward(enemy.species.xpReward, comboRef.current.count + 1)
    if (gained <= 0) return
    const beforeLevel = levelForXp(heroXpRef.current)
    const nextXp = heroXpRef.current + gained
    heroXpRef.current = nextXp
    sessionXpRef.current += gained
    setHeroXp(nextXp)
    spawnFloatingText(enemy.x, enemy.y - 14, `+${gained} EXP`, 'gain')
    const afterLevel = levelForXp(nextXp)
    if (afterLevel > beforeLevel) triggerLevelUp(afterLevel)
  }, [spawnFloatingText, triggerLevelUp])

  const spawnLootDrop = useCallback((x: number, y: number, tier: 1 | 2 = 1) => {
    const loot = rollLoot(random, tier)
    if (!loot) return
    dropIdRef.current += 1
    const drop: GroundDrop = { id: dropIdRef.current, kind: loot.kind, amount: loot.amount, x, y }
    setDrops((current) => {
      const next = [...current.slice(-9), drop]
      dropsRef.current = next
      return next
    })
  }, [random])

  const pickupDrop = useCallback((dropId: number) => {
    const drop = dropsRef.current.find((entry) => entry.id === dropId)
    if (!drop) return
    if (!isWithinRange(drop, positionRef.current, LESSON_PICKUP_RANGE)) {
      setCombatNotice('เดินเข้าไปใกล้ๆ ก่อนถึงจะเก็บของได้')
      return
    }
    const result = addToBag(bagRef.current, drop.kind, drop.amount)
    if (!result.added) {
      setCombatNotice('กระเป๋าเต็ม! ใช้ของก่อนแล้วค่อยเก็บเพิ่ม')
      return
    }
    bagRef.current = result.bag
    setBag(result.bag)
    if (drop.kind === 'coin') sessionCoinsRef.current += drop.amount
    // Ref-first removal (same pattern as enemiesRef): the world tick re-checks
    // dropsRef every 100ms, so updating the ref inside the setState updater
    // (which React may batch across ticks) could double-collect one drop.
    const remaining = dropsRef.current.filter((entry) => entry.id !== dropId)
    dropsRef.current = remaining
    setDrops(remaining)
    spawnFloatingText(drop.x, drop.y - 4, drop.kind === 'coin' ? `+${drop.amount}` : `+${LOOT_INFO[drop.kind].label}`, 'gain')
    pushLootFeed(drop.kind, drop.amount)
  }, [pushLootFeed, spawnFloatingText])

  const usePotion = useCallback(() => {
    if (!bagRef.current.some((item) => item.kind === 'potion' && item.count > 0)) {
      setCombatNotice('ไม่มียาฟื้นฟูในกระเป๋า ตีมอนสเตอร์หาดรอปก่อน')
      return
    }
    const healCap = progressRef.current.zone === 3 ? 100 : heroProfileRef.current.maxHp
    if (playerHpRef.current >= healCap) {
      setCombatNotice('พลังชีวิตเต็มอยู่แล้ว')
      return
    }
    const result = takeFromBag(bagRef.current, 'potion')
    if (!result.taken) return
    bagRef.current = result.bag
    setBag(result.bag)
    const healed = Math.min(healCap, playerHpRef.current + 30)
    playerHpRef.current = healed
    setPlayerHp(healed)
    if (progressRef.current.zone === 3) setBossBattle((current) => ({ ...current, playerHp: healed }))
    spawnFloatingText(positionRef.current.x, positionRef.current.y - 8, '+30', 'gain')
  }, [spawnFloatingText])

  const useMonsterCard = useCallback(() => {
    const result = takeFromBag(bagRef.current, 'card')
    if (!result.taken) {
      setCombatNotice('ยังไม่มีการ์ดมอนสเตอร์ ดรอปแรร์จากการตีมอนเท่านั้น!')
      return
    }
    bagRef.current = result.bag
    setBag(result.bag)
    setAtkBonus((current) => current + LESSON_CARD_ATTACK_BONUS)
    spawnFloatingText(positionRef.current.x, positionRef.current.y - 8, `ATK +${LESSON_CARD_ATTACK_BONUS}!`, 'crit')
    setCombatNotice(`ผนึกการ์ดมอนสเตอร์แล้ว! พลังโจมตีเพิ่มขึ้น +${LESSON_CARD_ATTACK_BONUS}`)
  }, [spawnFloatingText])

  const toggleAutoBattle = useCallback(() => {
    setAutoBattle((current) => {
      const next = !current
      setCombatNotice(next
        ? '🤖 เปิดออโต้: บอทจะเดินหามอนสเตอร์ โจมตี ใช้สกิล และกินยาให้เอง'
        : 'ปิดโหมดออโต้แล้ว กลับมาควบคุมเองได้เลย')
      return next
    })
  }, [])
  autoToggleRef.current = toggleAutoBattle

  const stopBossSwing = useCallback(() => {
    if (bossSwingTimer.current !== null) window.clearInterval(bossSwingTimer.current)
    if (bossSwingCooldownTimer.current !== null) window.clearTimeout(bossSwingCooldownTimer.current)
    bossSwingTimer.current = null
    bossSwingCooldownTimer.current = null
  }, [])

  const triggerBossSwing = useCallback(() => {
    if (bossSwingTimer.current !== null || !bossEngagedRef.current) return
    bossActionRef.current = 'swing'
    setBossAction('swing')
    setBossFrame(0)
    let swingFrame = 0
    bossSwingTimer.current = window.setInterval(() => {
      swingFrame += 1
      setBossFrame(swingFrame)
      if (swingFrame === BOSS_SWING_CONTACT_FRAME) bossStrikeRef.current()
      if (swingFrame >= BOSS_ATTACK_FRAME_COUNT - 1) {
        if (bossSwingTimer.current !== null) window.clearInterval(bossSwingTimer.current)
        bossSwingTimer.current = null
        setBossFrame(0)
        if (bossEngagedRef.current) {
          bossActionRef.current = 'ready'
          setBossAction('ready')
          bossSwingCooldownTimer.current = window.setTimeout(triggerBossSwing, BOSS_SWING_COOLDOWN_MS)
        } else {
          bossActionRef.current = 'walk'
          setBossAction('walk')
        }
      }
    }, BOSS_SWING_FRAME_MS)
  }, [])

  const open = useCallback(() => {
    const nextLesson = service.getCurrentLesson()
    // Returning from the worksheet page resumes the paused run in place —
    // a full reset here would wipe the kid's kills, loot, and zone progress.
    // Resume is valid only for the very same lesson the pause belongs to.
    if (worksheetPausedRef.current && worksheetPausedRef.current === nextLesson?.id) {
      worksheetPausedRef.current = null
      pausedRef.current = false
      setPaused(false)
      return
    }
    if (pointerMoveTimer.current !== null) window.cancelAnimationFrame(pointerMoveTimer.current)
    if (pointerFrameTimer.current !== null) window.clearInterval(pointerFrameTimer.current)
    pointerMoveTimer.current = null
    pointerFrameTimer.current = null
    chaseEnemyIdRef.current = null
    worksheetPausedRef.current = null
    pausedRef.current = false
    setPaused(false)
    setCharOpen(false)
    setAutoBattle(false)
    autoAttackLastRef.current = 0
    setLesson(nextLesson)
    // Opening the lesson is what satisfies a teacher quest's "ศึกษาบทเรียน"
    // objective. Fire-and-forget: the stamp is idempotent server-side and must
    // never delay or block the adventure starting.
    if (nextLesson?.id) void service.markLessonStudied?.(nextLesson.id)
    const hero = service.getCurrentUser?.() || null
    setHeroUser(hero)
    heroUserRef.current = hero
    heroXpRef.current = Math.max(0, Number(hero?.xp) || 0)
    setHeroXp(heroXpRef.current)
    sessionXpRef.current = 0
    sessionCoinsRef.current = 0
    if (levelUpTimer.current !== null) window.clearTimeout(levelUpTimer.current)
    levelUpTimer.current = null
    setLevelUpLevel(null)
    const heroProfile = heroCombatProfile(hero?.inventory?.stats)
    heroProfileRef.current = heroProfile
    setHeroMaxHp(heroProfile.maxHp)
    setProgress(createLessonAdventure(hasLessonVideo(nextLesson?.videoUrl)))
    const freshEnemies = createZoneEnemies(1, nextLesson ? resolveLessonMapSet(nextLesson.lessonMapSet, nextLesson.id) : LEGACY_LESSON_MAP_SET)
    enemiesRef.current = freshEnemies
    setEnemies(freshEnemies)
    setPlayerHp(heroProfile.maxHp)
    setBossPhase('idle')
    setBossQuestions([])
    setBossQuestionIndex(0)
    setBossRemainingQuestionIndexes([])
    setBossBattle(createBossBattleState())
    setBossHits(0)
    setBossUser(null)
    setBossError('')
    setBossImpact(null)
    setBossResult(null)
    stopBossSwing()
    bossEngagedRef.current = false
    bossPositionRef.current = LESSON_BOSS_POSITION
    bossActionRef.current = 'ready'
    setBossPosition(LESSON_BOSS_POSITION)
    setBossAction('ready')
    setBossDirection('down')
    setBossFrame(0)
    setPlayerActionState('idle')
    setCombatNotice('')
    setNoteOpen(false)
    setVideoOpen(false)
    setVideoReady(false)
    dropsRef.current = []
    bagRef.current = []
    setDrops([])
    setBag([])
    setBagOpen(false)
    setNotePickup(null)
    spRef.current = LESSON_SP_MAX
    setSp(LESSON_SP_MAX)
    atkBonusRef.current = 0
    setAtkBonus(0)
    setCombo({ count: 0, lastHitAt: 0 })
    setLootFeed([])
    setHitSparks([])
    setShaking(false)
    if (deathChoiceTimer.current !== null) window.clearTimeout(deathChoiceTimer.current)
    deathChoiceTimer.current = null
    playerDeadRef.current = false
    setPlayerDead(false)
    setDeathChoiceOpen(false)
    setPosition(LESSON_ZONE_CONFIGS[1].playerSpawn)
  }, [service, setPlayerActionState, stopBossSwing])

  const stopPointerMove = useCallback((resetFrame = true) => {
    if (pointerMoveTimer.current !== null) window.cancelAnimationFrame(pointerMoveTimer.current)
    if (pointerFrameTimer.current !== null) window.clearInterval(pointerFrameTimer.current)
    pointerMoveTimer.current = null
    pointerFrameTimer.current = null
    if (resetFrame) {
      setPlayerActionState('idle')
      setFrame(0)
    }
  }, [setPlayerActionState])

  const stopHeldMove = useCallback(() => {
    if (heldMoveTimer.current !== null) window.cancelAnimationFrame(heldMoveTimer.current)
    if (heldFrameTimer.current !== null) window.clearInterval(heldFrameTimer.current)
    heldMoveTimer.current = null
    heldFrameTimer.current = null
    heldDirection.current = null
    setPlayerActionState('idle')
    setFrame(0)
  }, [setPlayerActionState])

  const stepHeldMove = useCallback((nextDirection: WalkDirection, elapsedMs = 16) => {
    setDirection(nextDirection)
    setPosition((current) => {
      const next = moveCharacter(current, nextDirection, movementStepForElapsed(elapsedMs, 18), LESSON_WALK_BOUNDS)
      positionRef.current = next
      return next
    })
    setPlayerActionState('walk')
  }, [setPlayerActionState])

  const startHeldMove = useCallback((nextDirection: WalkDirection) => {
    chaseEnemyIdRef.current = null
    stopPointerMove(false)
    if (heldDirection.current === nextDirection && heldMoveTimer.current !== null) return
    stopHeldMove()
    heldDirection.current = nextDirection
    setDirection(nextDirection)
    setPlayerActionState('walk')
    // Apply one frame immediately so touch/keyboard input feels responsive
    // even when a busy mobile browser delays the first animation callback.
    stepHeldMove(nextDirection, 16)
    let previousFrame: number | null = null
    const moveOnFrame = (timestamp: number) => {
      const activeDirection = heldDirection.current
      if (!activeDirection) {
        heldMoveTimer.current = null
        return
      }
      stepHeldMove(activeDirection, movementElapsedForFrame(previousFrame, timestamp))
      previousFrame = timestamp
      heldMoveTimer.current = window.requestAnimationFrame(moveOnFrame)
    }
    heldMoveTimer.current = window.requestAnimationFrame(moveOnFrame)
    heldFrameTimer.current = window.setInterval(() => {
      setFrame((current) => (current + 1) % TEST_CHARACTER_SPRITE.walkFrames.length)
    }, 110)
  }, [setPlayerActionState, stepHeldMove, stopHeldMove, stopPointerMove])

  // The hero profile is one shared overlay for the whole game (see
  // HeroProfile.tsx). Opening it here just pauses the run, banks pending XP so
  // the server-side level is current for stat allocation, and fires the event.
  const openCharPanel = useCallback(() => {
    chaseEnemyIdRef.current = null
    stopHeldMove()
    stopPointerMove()
    setCharOpen(true)
    void flushSessionRewards()
    window.dispatchEvent(new Event('nextgen:open-hero-profile'))
  }, [flushSessionRewards, stopHeldMove, stopPointerMove])

  useEffect(() => {
    window.addEventListener('nextgen:open-lesson', open)
    return () => window.removeEventListener('nextgen:open-lesson', open)
  }, [open])

  useEffect(() => {
    if (!lesson || paused) return
    setLessonMusic(progress.zone)
  }, [lesson, paused, progress.zone])

  // One bag / one profile everywhere: the lesson pauses while the shared
  // overlay covers the world and resumes when it reports itself closed.
  useEffect(() => {
    const bagClosed = () => setBagOpen(false)
    const profileClosed = () => setCharOpen(false)
    window.addEventListener('nextgen:inventory-closed', bagClosed)
    window.addEventListener('nextgen:hero-profile-closed', profileClosed)
    return () => {
      window.removeEventListener('nextgen:inventory-closed', bagClosed)
      window.removeEventListener('nextgen:hero-profile-closed', profileClosed)
    }
  }, [])

  // Live outfit/coins/stats sync while inside the lesson (e.g. equipping from
  // the global bag or allocating points in the shared profile): merge
  // bridge-side changes without touching local run XP/HP.
  useEffect(() => {
    const sync = () => {
      const fresh = service.getCurrentUser?.()
      if (!fresh) return
      const profile = heroCombatProfile(fresh.inventory?.stats)
      heroProfileRef.current = profile
      setHeroMaxHp(profile.maxHp)
      setHeroUser((current) => current
        ? { ...current, inventory: fresh.inventory, avatar: fresh.avatar, coins: fresh.coins }
        : current)
    }
    window.addEventListener('nextgen:user-updated', sync)
    return () => window.removeEventListener('nextgen:user-updated', sync)
  }, [service])

  // Persistent teacher-quest tracker, mirroring the hub widget: fetched fresh
  // whenever a lesson opens, and refreshed (debounced) after accept/turn-in
  // events elsewhere so it never goes stale without leaving the lesson.
  useEffect(() => {
    if (!lesson) {
      setTrackedTeacherQuest(null)
      return
    }
    let cancelled = false
    const fetchTracked = async () => {
      const user = service.getCurrentUser?.()
      if (!user) return
      try {
        const board = await service.loadQuestBoard?.(user.id)
        if (!cancelled) setTrackedTeacherQuest(board?.success ? trackedQuest(board.data || []) : null)
      } catch {
        if (!cancelled) setTrackedTeacherQuest(null)
      }
    }
    void fetchTracked()
    let refreshTimer: number | null = null
    const onUserUpdated = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => void fetchTracked(), 1200)
    }
    window.addEventListener('nextgen:user-updated', onUserUpdated)
    return () => {
      cancelled = true
      window.removeEventListener('nextgen:user-updated', onUserUpdated)
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
    }
  }, [lesson, service])

  // The worksheet page covers this fixed overlay; hide and pause the run (and bank
  // pending rewards) until nextgen:open-lesson resumes it.
  useEffect(() => {
    const pauseForWorksheet = () => {
      if (!lesson) return
      worksheetPausedRef.current = lesson.id
      pausedRef.current = true
      setPaused(true)
      chaseEnemyIdRef.current = null
      stopHeldMove()
      stopPointerMove()
      void flushSessionRewards()
    }
    window.addEventListener('nextgen:open-worksheet', pauseForWorksheet)
    return () => window.removeEventListener('nextgen:open-worksheet', pauseForWorksheet)
  }, [flushSessionRewards, lesson, stopHeldMove, stopPointerMove])

  useEffect(() => {
    const move = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof Element && target.matches('input, textarea, select, [contenteditable="true"]')) return
      if (playerDeadRef.current || pausedRef.current) return
      const nextDirection = directionForKey(event.key)
      if (event.code === 'Space') {
        event.preventDefault()
        attackActionRef.current()
        return
      }
      if (event.key === 'e' || event.key === 'E') {
        skillActionRef.current()
        return
      }
      if (event.key === '1') {
        potionActionRef.current()
        return
      }
      if (event.key === '2') {
        cardActionRef.current()
        return
      }
      if (event.key === 'r' || event.key === 'R') {
        autoToggleRef.current()
        return
      }
      if (!nextDirection || !lesson) return
      event.preventDefault()
      startHeldMove(nextDirection)
    }
    const stopMove = (event: KeyboardEvent) => {
      const nextDirection = directionForKey(event.key)
      if (nextDirection && heldDirection.current === nextDirection) stopHeldMove()
    }
    window.addEventListener('keydown', move)
    window.addEventListener('keyup', stopMove)
    return () => {
      window.removeEventListener('keydown', move)
      window.removeEventListener('keyup', stopMove)
    }
  }, [lesson, startHeldMove, stopHeldMove])

  useEffect(() => {
    if (!videoOpen) return
    const fallbackUnlockMs = videoUnlockMs ?? (lesson?.videoUrl && !hasTrackableLessonVideo(lesson.videoUrl) ? 15_000 : undefined)
    if (fallbackUnlockMs === undefined) return
    if (fallbackUnlockMs <= 0) {
      setVideoReady(true)
      return
    }
    const timer = window.setTimeout(() => setVideoReady(true), fallbackUnlockMs)
    return () => window.clearTimeout(timer)
  }, [lesson?.videoUrl, videoOpen, videoUnlockMs])

  useEffect(() => {
    if (!videoOpen) return
    const receiveVideoState = (event: MessageEvent) => {
      if (lessonVideoMessageEnded(event.origin, event.data)) setVideoReady(true)
    }
    window.addEventListener('message', receiveVideoState)
    return () => window.removeEventListener('message', receiveVideoState)
  }, [videoOpen])

  useEffect(() => {
    if (!bossImpact) return
    const timer = window.setTimeout(() => setBossImpact(null), 520)
    return () => window.clearTimeout(timer)
  }, [bossImpact])

  useEffect(() => {
    if (!lesson || paused) return
    const timer = window.setInterval(() => {
      setSp((current) => Math.min(LESSON_SP_MAX, current + LESSON_SP_REGEN))
    }, LESSON_SP_REGEN_MS)
    return () => window.clearInterval(timer)
  }, [lesson, paused])

  useEffect(() => {
    if (bossPhase !== 'skirmish' || paused) return
    const timer = window.setInterval(() => {
      const next = stepLessonBoss(bossPositionRef.current, positionRef.current, 16, LESSON_BOSS_MELEE_RANGE, bossEngagedRef.current ? 'attack' : 'walk')
      bossPositionRef.current = { x: next.x, y: next.y }
      setBossPosition({ x: next.x, y: next.y })
      setBossDirection(next.direction)
      if (next.mode === 'attack') {
        if (!bossEngagedRef.current) {
          bossEngagedRef.current = true
          bossActionRef.current = 'ready'
          setBossAction('ready')
          setBossFrame(0)
          bossSwingCooldownTimer.current = window.setTimeout(triggerBossSwing, BOSS_SWING_WINDUP_MS)
        }
      } else if (bossEngagedRef.current) {
        bossEngagedRef.current = false
        stopBossSwing()
        bossActionRef.current = 'walk'
        setBossAction('walk')
      }
    }, 16)
    return () => {
      window.clearInterval(timer)
      stopBossSwing()
      bossEngagedRef.current = false
    }
  }, [bossPhase, paused, stopBossSwing, triggerBossSwing])

  useEffect(() => {
    if (bossPhase !== 'skirmish' || paused) return
    const timer = window.setInterval(() => {
      if (bossActionRef.current !== 'walk') return
      setBossFrame((current) => (current + 1) % BOSS_WALK_FRAME_COUNT)
    }, 110)
    return () => window.clearInterval(timer)
  }, [bossPhase, paused])

  // Auto-battle driver: one decision per animation frame, executed through the exact
  // same handlers the player uses (attack/skill/potion refs + the shared
  // movement helpers), so the bot can never out-perform manual play. The
  // effect's dependency list is the pause switch: any modal, death, pause or
  // non-skirmish boss phase tears the interval down.
  useEffect(() => {
    if (!lesson || !autoBattle || paused || playerDead || charOpen || bagOpen || noteOpen || videoOpen || deathChoiceOpen) return
    if (progress.zone === 3 && bossPhase !== 'skirmish') return
    autoWalkAnimRef.current = 0
    let previousFrame: number | null = null
    let animationFrame = 0
    let active = true
    const runAutoFrame = (timestamp: number) => {
      if (!active) return
      const elapsedMs = movementElapsedForFrame(previousFrame, timestamp)
      const movementStep = autoMovementStepForFrame(previousFrame, timestamp)
      previousFrame = timestamp
      const zone = progressRef.current.zone
      const decision = decideAutoBattle({
        zone,
        bossPhase,
        playerDead: playerDeadRef.current,
        paused: pausedRef.current,
        uiBlocked: false,
        manualControl: heldDirection.current !== null || chaseEnemyIdRef.current !== null || pointerMoveTimer.current !== null,
        player: positionRef.current,
        playerHp: playerHpRef.current,
        playerMaxHp: zone === 3 ? 100 : heroProfileRef.current.maxHp,
        potions: bagRef.current.find((item) => item.kind === 'potion')?.count ?? 0,
        sp: spRef.current,
        skillSpCost: LESSON_SKILL_SP_COST,
        attackReady: Date.now() - autoAttackLastRef.current >= AUTO_ATTACK_COOLDOWN_MS,
        enemies: enemiesRef.current,
        bossPosition: bossPositionRef.current,
        engageRange: LESSON_MELEE_ENGAGE_RANGE,
        bossEngageRange: LESSON_BOSS_ENGAGE_RANGE,
        drops: dropsRef.current,
        pickupRange: LESSON_PICKUP_RANGE - 2,
      })
      if (decision.action === 'potion') {
        potionActionRef.current()
      } else if (decision.action === 'attack' || decision.action === 'boss-attack') {
        autoAttackLastRef.current = Date.now()
        attackActionRef.current()
      } else if (decision.action === 'skill') {
        autoAttackLastRef.current = Date.now()
        skillActionRef.current()
      } else if (decision.action === 'move') {
        // Let an in-progress sword swing finish before stepping again.
        if (playerActionRef.current !== 'attack') {
          const nextDirection = directionTowardTarget(positionRef.current, decision.target)
          const moved = moveTowardTarget(
            positionRef.current,
            decision.target,
            movementStep,
            LESSON_WALK_BOUNDS,
          )
          positionRef.current = moved.position
          setPosition(moved.position)
          setDirection(nextDirection)
          setPlayerActionState('walk')
          autoWalkAnimRef.current += elapsedMs
          if (autoWalkAnimRef.current >= 110) {
            autoWalkAnimRef.current %= 110
            setFrame((current) => (current + 1) % TEST_CHARACTER_SPRITE.walkFrames.length)
          }
        }
      } else if (playerActionRef.current === 'walk' && heldDirection.current === null && pointerMoveTimer.current === null) {
        setPlayerActionState('idle')
        setFrame(0)
      }
      animationFrame = window.requestAnimationFrame(runAutoFrame)
    }
    animationFrame = window.requestAnimationFrame(runAutoFrame)
    return () => {
      active = false
      window.cancelAnimationFrame(animationFrame)
    }
  }, [lesson, autoBattle, paused, playerDead, charOpen, bagOpen, noteOpen, videoOpen, deathChoiceOpen, progress.zone, bossPhase, setPlayerActionState])

  useEffect(() => {
    if (!lesson || paused || charOpen || bagOpen || progress.zone === 3 || noteOpen || videoOpen) return
    const timer = window.setInterval(() => {
      if (playerDeadRef.current) return
      let damage = 0
      const phase = Date.now() / 1800
      const next = enemiesRef.current
        .map((enemy) => {
          const result = stepLessonEnemy(enemy, positionRef.current, 100, phase)
          damage += result.playerDamage
          return result.enemy
        })
        .map((enemy) => enemy.mode === 'dead' && enemy.frame > LESSON_ENEMY_RESPAWN_TICKS ? respawnLessonEnemy(enemy) : enemy)
      enemiesRef.current = next
      setEnemies(next)
      for (const drop of [...dropsRef.current]) {
        if (isWithinRange(drop, positionRef.current, LESSON_PICKUP_RANGE - 2)) pickupDrop(drop.id)
      }
      const zoneProgress = progressRef.current
      if (zoneProgress.zone === 1 || zoneProgress.zone === 2) {
        const canWarp = lessonZoneQuestDone(zoneProgress) && lessonKillQuestDone(zoneProgress)
        if (canWarp && isWithinRange(LESSON_ZONE_CONFIGS[zoneProgress.zone].portal, positionRef.current, LESSON_PORTAL_WARP_RANGE)) {
          enterZoneRef.current(zoneProgress.zone === 1 ? 2 : 3)
          return
        }
      }
      if (damage > 0) {
        const nextHp = Math.max(0, playerHpRef.current - damage)
        spawnFloatingText(positionRef.current.x, positionRef.current.y - 7, `-${damage}`, 'take')
        triggerShake()
        if (nextHp === 0) {
          playerHpRef.current = 0
          setPlayerHp(0)
          triggerDeath()
        } else {
          if (playerActionRef.current !== 'attack') {
            setPlayerActionState('hurt')
            const timeoutId = window.setTimeout(() => {
              ephemeralTimers.current.delete(timeoutId)
              if (playerActionRef.current === 'hurt') setPlayerActionState('idle')
            }, 180)
            ephemeralTimers.current.add(timeoutId)
          }
          playerHpRef.current = nextHp
          setPlayerHp(nextHp)
        }
      }
    }, 100)
    return () => window.clearInterval(timer)
  }, [bagOpen, charOpen, lesson, noteOpen, paused, pickupDrop, progress.zone, setPlayerActionState, spawnFloatingText, triggerDeath, triggerShake, videoOpen])

  useEffect(() => () => {
    if (levelUpTimer.current !== null) window.clearTimeout(levelUpTimer.current)
    if (attackAnimationRef.current !== null) window.clearInterval(attackAnimationRef.current)
    if (heldMoveTimer.current !== null) window.cancelAnimationFrame(heldMoveTimer.current)
    if (heldFrameTimer.current !== null) window.clearInterval(heldFrameTimer.current)
    if (pointerMoveTimer.current !== null) window.cancelAnimationFrame(pointerMoveTimer.current)
    if (pointerFrameTimer.current !== null) window.clearInterval(pointerFrameTimer.current)
    if (bossSwingTimer.current !== null) window.clearInterval(bossSwingTimer.current)
    if (bossSwingCooldownTimer.current !== null) window.clearTimeout(bossSwingCooldownTimer.current)
    if (comboTimer.current !== null) window.clearTimeout(comboTimer.current)
    if (shakeTimer.current !== null) window.clearTimeout(shakeTimer.current)
    if (deathChoiceTimer.current !== null) window.clearTimeout(deathChoiceTimer.current)
    ephemeralTimers.current.forEach((id) => window.clearTimeout(id))
    ephemeralTimers.current.clear()
  }, [])

  if (!lesson) return <section id="page-lesson" className="hidden" />

  const walkToClientPoint = (clientX: number, clientY: number, fallbackElement: HTMLDivElement) => {
    if (playerDeadRef.current) return
    chaseEnemyIdRef.current = null
    const rect = worldRef.current?.getBoundingClientRect() ?? fallbackElement.getBoundingClientRect()
    const safeClientX = Number.isFinite(clientX) ? clientX : rect.left + rect.width / 2
    const safeClientY = Number.isFinite(clientY) ? clientY : rect.top + rect.height / 2
    const target = pointerToWalkPosition(safeClientX, safeClientY, rect, LESSON_WALK_BOUNDS)
    stopHeldMove()
    stopPointerMove(false)
    const stepToTarget = (elapsedMs: number) => {
      const current = positionRef.current
      const nextDirection = directionTowardTarget(current, target)
      const result = moveTowardTarget(current, target, movementStepForElapsed(elapsedMs, 18), LESSON_WALK_BOUNDS)
      positionRef.current = result.position
      setDirection(nextDirection)
      setPosition(result.position)
      setPlayerActionState(result.reached ? 'idle' : 'walk')
      if (result.reached) stopPointerMove()
      return result.reached
    }
    const reachedImmediately = stepToTarget(16)
    if (!reachedImmediately) {
      let previousFrame: number | null = null
      const moveOnFrame = (timestamp: number) => {
        const elapsedMs = movementElapsedForFrame(previousFrame, timestamp)
        previousFrame = timestamp
        if (!stepToTarget(elapsedMs)) pointerMoveTimer.current = window.requestAnimationFrame(moveOnFrame)
      }
      pointerMoveTimer.current = window.requestAnimationFrame(moveOnFrame)
      pointerFrameTimer.current = window.setInterval(() => {
        setFrame((current) => (current + 1) % TEST_CHARACTER_SPRITE.walkFrames.length)
      }, 110)
      setPlayerActionState('walk')
      setFrame((current) => (current + 1) % TEST_CHARACTER_SPRITE.walkFrames.length)
    }
  }

  const moveToPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    walkToClientPoint(event.clientX, event.clientY, event.currentTarget)
  }

  const moveToMouse = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (typeof window.PointerEvent !== 'undefined') return
    if ((event.target as HTMLElement).closest('button')) return
    walkToClientPoint(event.clientX, event.clientY, event.currentTarget)
  }

  const worldCanvasStyle: CSSProperties = {
    width: `${LESSON_CAMERA_SCALE.x * 100}%`,
    height: `${LESSON_CAMERA_SCALE.y * 100}%`,
    transform: `translate(-${cameraOffset(position.x, LESSON_CAMERA_SCALE.x)}%, -${cameraOffset(position.y, LESSON_CAMERA_SCALE.y)}%)`,
    backgroundImage: `url(${activeMapSet.zoneImages[progress.zone]})`,
  }
  const zoneConfig = LESSON_ZONE_CONFIGS[progress.zone]
  // Paper-doll hero: every equipped LPC layer stacks in one div; a single
  // background-size/position pair drives all layers since they share the grid.
  const playerStyle: CSSProperties = {
    left: `${position.x}%`,
    top: `${position.y}%`,
    transitionDuration: '0ms',
    transitionProperty: 'none',
    backgroundImage: characterLayerImages(heroUser?.inventory, heroUser?.gender),
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${TEST_CHARACTER_SPRITE.columns * 104}px ${TEST_CHARACTER_SPRITE.rows * 104}px`,
    backgroundPosition: playerAction === 'attack'
      ? `${-attackFrameColumns[frame % attackFrameColumns.length] * 104}px ${-attackRows[direction] * 104}px`
      : spriteBackgroundPosition(TEST_CHARACTER_SPRITE, direction, frame, 104),
  }
  const bossAnimating = bossPhase === 'skirmish'
  const bossRow = !bossAnimating
    ? BOSS_SPRITE_IDLE_ROW
    : bossAction === 'swing' ? BOSS_ATTACK_ROWS[bossDirection] : BOSS_WALK_ROWS[bossDirection]
  const bossFrameCount = bossAction === 'swing' ? BOSS_ATTACK_FRAME_COUNT : BOSS_WALK_FRAME_COUNT
  const bossColumn = bossAnimating ? bossFrame % bossFrameCount : 0
  const bossSpriteStyle: CSSProperties = {
    display: 'block',
    backgroundImage: activeMapSet.bossSkin ? 'none' : `url(${warriorSprite})`,
    backgroundSize: `${BOSS_SPRITE_COLUMNS * BOSS_SPRITE_RENDER_SIZE}px ${BOSS_SPRITE_ROWS * BOSS_SPRITE_RENDER_SIZE}px`,
    backgroundPosition: `${-bossColumn * BOSS_SPRITE_RENDER_SIZE}px ${-bossRow * BOSS_SPRITE_RENDER_SIZE}px`,
    backgroundRepeat: 'no-repeat',
  }

  const playAttackAnimation = (facing: WalkDirection) => {
    playSwordHit()
    stopHeldMove()
    stopPointerMove(false)
    setDirection(facing)
    setPlayerActionState('attack')
    setFrame(0)
    if (attackAnimationRef.current !== null) window.clearInterval(attackAnimationRef.current)
    let attackFrame = 0
    attackAnimationRef.current = window.setInterval(() => {
      attackFrame += 1
      setFrame(attackFrame)
      if (attackFrame >= attackFrameColumns.length - 1) {
        if (attackAnimationRef.current !== null) window.clearInterval(attackAnimationRef.current)
        attackAnimationRef.current = null
        setPlayerActionState('idle')
        setFrame(0)
      }
    }, 80)
  }

  const completeBossFight = async (intendedWin: boolean, reason: string, finalBattle: BattleState) => {
    if (!lesson || !bossUser) return
    // Land pending field XP before the boss transaction so its returned stats
    // (and the bridge sync below) always include the whole run's experience.
    await flushSessionRewards()
    const outcome = battleOutcome(intendedWin, finalBattle.score, bossQuestions.length)
    const result: BossFightResult = {
      ...outcome,
      score: finalBattle.score,
      total: bossQuestions.length,
      stars: starsForScore(finalBattle.score, bossQuestions.length),
      reason,
    }
    setBossResult(result)
    setBossPhase('result')
    try {
      if (!service.saveProgress) return
      const saved = await service.saveProgress(bossUser.id, lesson.id, outcome.passed ? 'Passed' : 'Failed', finalBattle.score, bossQuestions.length)
      if (!saved.success || !saved.stats) throw new Error(saved.error || 'save failed')
      const passedLessons = outcome.passed && !bossUser.passedLessons?.includes(lesson.id)
        ? [...(bossUser.passedLessons || []), lesson.id]
        : bossUser.passedLessons
      setBossResult((current) => current ? { ...current, stats: saved.stats } : current)
      onUserUpdate?.({ ...saved.stats, passedLessons })
    } catch {
      setBossResult((current) => current ? { ...current, saveError: 'บันทึกผลไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต' } : current)
    }
  }

  const challengeLessonBoss = async () => {
    if (!lesson || (bossPhase !== 'idle' && bossPhase !== 'error')) return
    if (!service.getCurrentUser || !service.loadQuestions) {
      onStartQuiz()
      return
    }
    const currentUser = service.getCurrentUser()
    if (!currentUser) {
      setBossError('ไม่พบข้อมูลผู้เล่น')
      setBossPhase('error')
      return
    }
    setBossPhase('loading')
    setBossUser(currentUser)
    setBossQuestions([])
    setBossRemainingQuestionIndexes([])
    setBossQuestionIndex(0)
    setBossHits(0)
    stopBossSwing()
    bossEngagedRef.current = false
    bossPositionRef.current = LESSON_BOSS_POSITION
    bossActionRef.current = 'ready'
    setBossPosition(LESSON_BOSS_POSITION)
    setBossAction('ready')
    setBossDirection('down')
    setBossFrame(0)
    setBossError('')
    setBossResult(null)
    const initial = createBossBattleState(Math.max(playerHpRef.current, BOSS_MIN_STARTING_PLAYER_HP))
    playerHpRef.current = initial.playerHp
    setPlayerHp(initial.playerHp)
    setBossBattle(initial)
    try {
      const loaded = await service.loadQuestions(lesson.id)
      if (!loaded.success) throw new Error(loaded.error || 'load failed')
      const data = loaded.data || []
      if (data.length === 0) {
        setBossError('ไม่พบคำถามสำหรับบอสบทเรียนนี้')
        setBossPhase('error')
        return
      }
      setBossQuestions(data)
      setBossRemainingQuestionIndexes(data.map((_, questionIndex) => questionIndex))
      setBossPhase('skirmish')
      service.trackDailyProgress?.('play1')
      setCombatNotice('บอสรับคำท้าแล้ว! เดินเข้าใกล้แล้วฟันให้ครบจังหวะเพื่อเปิดคำถาม')
    } catch {
      setBossError('โหลดคำถามบอสไม่สำเร็จ')
      setBossPhase('error')
    }
  }

  const openBossQuestion = (remainingQuestionIndexes: number[]) => {
    const selected = selectBossSkillQuestionIndex(remainingQuestionIndexes, random)
    if (selected < 0) return
    setBossQuestionIndex(selected)
    setBossHits(0)
    setBossImpact(null)
    setBossPhase('question')
    stopHeldMove()
    stopPointerMove()
  }

  const attackLessonBoss = () => {
    if (bossPhase === 'idle' || bossPhase === 'error') {
      void challengeLessonBoss()
      return
    }
    if (bossPhase !== 'skirmish' || bossQuestions.length === 0 || bossRemainingQuestionIndexes.length === 0) return
    const facing = directionTowardTarget(positionRef.current, bossPositionRef.current)
    playAttackAnimation(facing)
    const distance = Math.hypot(bossPositionRef.current.x - positionRef.current.x, bossPositionRef.current.y - positionRef.current.y)
    if (distance > LESSON_BOSS_ATTACK_RANGE) {
      setCombatNotice('เข้าใกล้บอสก่อนถึงจะโจมตีโดน')
      return
    }
    setCombatNotice('')
    setBossImpact('boss')
    spawnFloatingText(bossPositionRef.current.x, bossPositionRef.current.y - 12, `-${skirmishBossDamagePerTick}`, 'deal')
    spawnHitSpark(bossPositionRef.current.x, bossPositionRef.current.y - 8, false)
    registerCombo()
    setBossBattle((current) => {
      const next = applySkirmishExchange(current, bossQuestions.length, bossRemainingQuestionIndexes.length)
      playerHpRef.current = next.playerHp
      setPlayerHp(next.playerHp)
      if (current.playerHp > 0 && next.playerHp <= 0) {
        void completeBossFight(false, 'พ่ายแพ้! ถูกบอสโต้กลับจนพลังชีวิตหมด', next)
      }
      return next
    })
    window.setTimeout(() => setBossImpact('player'), 180)
    setBossHits((current) => {
      const nextHits = current + 1
      if (nextHits >= BOSS_HITS_PER_QUESTION) openBossQuestion(bossRemainingQuestionIndexes)
      return nextHits >= BOSS_HITS_PER_QUESTION ? 0 : nextHits
    })
  }

  const attackNearest = (requestedId?: number, skill = false) => {
    if (playerDeadRef.current) return
    chaseEnemyIdRef.current = null
    if (skill && spRef.current < LESSON_SKILL_SP_COST) {
      setCombatNotice(`SP ไม่พอ! สกิลฟันหนักใช้ ${LESSON_SKILL_SP_COST} SP`)
      return
    }
    const range = skill ? LESSON_SKILL_ATTACK_RANGE : LESSON_PLAYER_ATTACK_RANGE
    const living = enemiesRef.current
    const requested = requestedId === undefined ? null : living.find((enemy) => enemy.id === requestedId && enemy.hp > 0) || null
    const target = requestedId === undefined
      ? selectEnemyInAttackRange(living, positionRef.current, range)
      : requested && Math.hypot(requested.x - positionRef.current.x, requested.y - positionRef.current.y) <= range ? requested : null
    const facing = target ? directionTowardTarget(positionRef.current, target) : direction
    playAttackAnimation(facing)
    if (!target) {
      setCombatNotice('ไม่มีมอนสเตอร์อยู่ในระยะโจมตี')
      return
    }

    setCombatNotice('')
    if (skill) setSp((current) => Math.max(0, current - LESSON_SKILL_SP_COST))
    const strike = rollPlayerStrike(random, atkBonusRef.current + heroProfileRef.current.bonusAttack, {
      critThreshold: heroProfileRef.current.critThreshold,
      varianceFloor: heroProfileRef.current.varianceFloor,
    })
    const damage = skill ? strike.damage * LESSON_SKILL_MULTIPLIER : strike.damage
    spawnFloatingText(target.x, target.y - 9, strike.crit ? `-${damage} CRIT!` : `-${damage}`, strike.crit ? 'crit' : 'deal')
    spawnHitSpark(target.x, target.y - 6, strike.crit || skill)
    registerCombo()

    const next = living.map((enemy) => {
      if (enemy.id !== target.id) return enemy
      const hp = Math.max(0, enemy.hp - damage)
      if (hp === 0 && enemy.hp > 0) {
        grantKillXp(enemy)
        spawnLootDrop(enemy.x, enemy.y, enemy.species.lootTier)
        if (progress.zone === 1 || progress.zone === 2) {
          setProgress((current) => {
            const advanced = defeatLessonMonster(current, random())
            if (current.zone === 1 && !current.noteDropped && advanced.noteDropped) setNotePickup({ x: enemy.x, y: enemy.y - 3 })
            return advanced
          })
        }
      }
      return { ...enemy, hp, mode: hp === 0 ? 'dead' as const : 'hurt' as const, frame: 0 }
    })
    enemiesRef.current = next
    setEnemies(next)
  }

  // Clicking a monster that's out of melee range walks the player to it first (re-tracking its
  // live position each tick, since field monsters patrol), then attacks automatically on arrival.
  const startChaseEnemy = (id: number) => {
    stopHeldMove()
    stopPointerMove(false)
    chaseEnemyIdRef.current = id
    const stepChase = (elapsedMs: number) => {
      if (chaseEnemyIdRef.current !== id) return true
      const enemy = enemiesRef.current.find((candidate) => candidate.id === id && candidate.hp > 0)
      if (!enemy) {
        chaseEnemyIdRef.current = null
        stopPointerMove()
        return true
      }
      const current = positionRef.current
      const distance = Math.hypot(enemy.x - current.x, enemy.y - current.y)
      // Walk all the way to contact (not just sword reach) before swinging —
      // melee heroes fight chest to chest, and the kill's loot then drops
      // right at the player's feet inside the auto-pickup radius.
      if (distance <= LESSON_MELEE_ENGAGE_RANGE) {
        chaseEnemyIdRef.current = null
        stopPointerMove()
        attackNearest(id)
        return true
      }
      const nextDirection = directionTowardTarget(current, enemy)
      const result = moveTowardTarget(current, enemy, movementStepForElapsed(elapsedMs, 18), LESSON_WALK_BOUNDS)
      positionRef.current = result.position
      setDirection(nextDirection)
      setPosition(result.position)
      setPlayerActionState('walk')
      return false
    }
    const reachedImmediately = stepChase(16)
    if (!reachedImmediately) {
      let previousFrame: number | null = null
      const moveOnFrame = (timestamp: number) => {
        const elapsedMs = movementElapsedForFrame(previousFrame, timestamp)
        previousFrame = timestamp
        if (!stepChase(elapsedMs)) pointerMoveTimer.current = window.requestAnimationFrame(moveOnFrame)
      }
      pointerMoveTimer.current = window.requestAnimationFrame(moveOnFrame)
      pointerFrameTimer.current = window.setInterval(() => {
        setFrame((current) => (current + 1) % TEST_CHARACTER_SPRITE.walkFrames.length)
      }, 110)
    }
  }

  const attackOrChaseEnemy = (id: number) => {
    if (playerDeadRef.current) return
    const enemy = enemiesRef.current.find((candidate) => candidate.id === id && candidate.hp > 0)
    if (!enemy) return
    const distance = Math.hypot(enemy.x - positionRef.current.x, enemy.y - positionRef.current.y)
    if (distance <= LESSON_PLAYER_ATTACK_RANGE) {
      attackNearest(id)
      return
    }
    startChaseEnemy(id)
  }
  attackActionRef.current = () => progress.zone === 3 ? attackLessonBoss() : attackNearest()
  skillActionRef.current = () => { if (progress.zone !== 3) attackNearest(undefined, true) }
  potionActionRef.current = usePotion
  cardActionRef.current = useMonsterCard
  bossStrikeRef.current = () => {
    if (bossPhase !== 'skirmish') return
    setBossBattle((current) => {
      const playerHp = Math.max(1, current.playerHp - BOSS_STRIKE_DAMAGE)
      playerHpRef.current = playerHp
      setPlayerHp(playerHp)
      return { ...current, playerHp }
    })
    spawnFloatingText(positionRef.current.x, positionRef.current.y - 7, `-${BOSS_STRIKE_DAMAGE}`, 'take')
    triggerShake()
    if (playerActionRef.current !== 'attack') {
      setPlayerActionState('hurt')
      const timeoutId = window.setTimeout(() => {
        ephemeralTimers.current.delete(timeoutId)
        if (playerActionRef.current === 'hurt') setPlayerActionState('idle')
      }, 180)
      ephemeralTimers.current.add(timeoutId)
    }
  }

  const answerBossQuestion = (correct: boolean) => {
    if (bossPhase !== 'question' || bossQuestions.length === 0) return
    const question = bossQuestions[bossQuestionIndex]
    if (!question) return
    const nextRemaining = bossRemainingQuestionIndexes.filter((questionIndex) => questionIndex !== bossQuestionIndex)
    const finalRemaining = nextRemaining.length === bossRemainingQuestionIndexes.length
      ? bossRemainingQuestionIndexes.slice(1)
      : nextRemaining
    const resolved = applyBattleAnswer(bossBattle, correct, bossQuestions.length)
    playerHpRef.current = resolved.playerHp
    setPlayerHp(resolved.playerHp)
    setBossBattle(resolved)
    setBossRemainingQuestionIndexes(finalRemaining)
    setBossHits(0)
    setBossImpact(correct ? 'boss' : 'player')
    if (correct) service.trackDailyProgress?.('correct5', question.qId)
    if (resolved.playerHp <= 0) {
      void completeBossFight(false, 'พ่ายแพ้! พลังชีวิตหมดจากสกิลบอส', resolved)
      return
    }
    if (finalRemaining.length === 0) {
      const percent = bossQuestions.length > 0 ? (resolved.score / bossQuestions.length) * 100 : 0
      const finalBattle = percent >= 60 ? { ...resolved, bossHp: 0 } : resolved
      setBossBattle(finalBattle)
      void completeBossFight(true, 'จบการต่อสู้กับบอสบทเรียน!', finalBattle)
      return
    }
    setBossPhase('skirmish')
    setCombatNotice('หลบสกิลได้แล้ว! ฟันต่อให้ครบจังหวะเพื่อเปิดคำถามถัดไป')
  }

  // Any real exit ends the run for good: clear the lesson and the worksheet
  // pause marker so the next entry (any lesson, including this one) is fresh.
  const closeLessonRun = () => {
    worksheetPausedRef.current = null
    setLesson(null)
  }

  const retreatToMap = () => {
    closeLessonRun()
    void flushSessionRewards()
    onBack()
  }

  const openGlobalBag = () => {
    chaseEnemyIdRef.current = null
    stopHeldMove()
    stopPointerMove()
    setBagOpen(true)
    window.dispatchEvent(new Event('nextgen:open-inventory'))
  }

  const enterZone = (zone: 2 | 3) => {
    chaseEnemyIdRef.current = null
    stopPointerMove()
    void flushSessionRewards()
    setProgress(useLessonPortal)
    setPosition(LESSON_ZONE_CONFIGS[zone].playerSpawn)
    positionRef.current = LESSON_ZONE_CONFIGS[zone].playerSpawn
    dropsRef.current = []
    setDrops([])
    setNotePickup(null)
    if (zone === 2) {
      const next = createZoneEnemies(2, activeMapSet)
      enemiesRef.current = next
      setEnemies(next)
    }
    if (zone === 3) {
      // Boss rooms are the one deliberate exception to the exploration default:
      // auto combat starts enabled so the player can focus on answering the boss skills.
      setAutoBattle(true)
      // The boss fight is a fixed 100-point quiz scale regardless of VIT-inflated exploration HP.
      const bossEntryHp = Math.min(100, playerHpRef.current)
      playerHpRef.current = bossEntryHp
      setPlayerHp(bossEntryHp)
      setBossPhase('idle')
      setBossQuestions([])
      setBossQuestionIndex(0)
      setBossRemainingQuestionIndexes([])
      setBossBattle(createBossBattleState(bossEntryHp))
      setBossHits(0)
      setBossUser(null)
      setBossError('')
      setBossImpact(null)
      setBossResult(null)
      stopBossSwing()
      bossEngagedRef.current = false
      bossPositionRef.current = LESSON_BOSS_POSITION
      bossActionRef.current = 'ready'
      setBossPosition(LESSON_BOSS_POSITION)
      setBossAction('ready')
      setBossDirection('down')
      setBossFrame(0)
    }
    setCombatNotice('')
  }
  enterZoneRef.current = enterZone

  const openVideo = () => {
    setVideoReady(videoUnlockMs !== undefined && videoUnlockMs <= 0)
    setVideoOpen(true)
  }

  const directVideo = isDirectLessonVideo(lesson.videoUrl)
  const embedUrl = toTrackedLessonEmbedUrl(lesson.videoUrl, window.location.origin)
  const hasWorksheet = Boolean(lesson.content?.trim() || lesson.worksheetUrl?.trim())
  const questCount = completedLessonQuests(progress)
  const xpProgress = levelProgress(heroXp)
  // Paper-doll portrait for HUD/profile: down-facing idle frame with all layers.
  const heroPortraitStyle = (size: number): CSSProperties => ({
    width: `${size}px`,
    height: `${size}px`,
    backgroundImage: characterLayerImages(heroUser?.inventory, heroUser?.gender),
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${TEST_CHARACTER_SPRITE.columns * size}px ${TEST_CHARACTER_SPRITE.rows * size}px`,
    backgroundPosition: spriteBackgroundPosition(TEST_CHARACTER_SPRITE, 'down', 0, size),
  })
  const displayedPlayerHp = progress.zone === 3 && bossPhase !== 'idle' ? Math.ceil(Math.max(0, bossBattle.playerHp)) : playerHp
  const displayedMaxHp = progress.zone === 3 ? 100 : heroMaxHp
  const currentBossQuestion = bossPhase === 'question' ? bossQuestions[bossQuestionIndex] : undefined
  const coinCount = bag.find((item) => item.kind === 'coin')?.count ?? 0
  const potionCount = bag.find((item) => item.kind === 'potion')?.count ?? 0
  const cardCount = bag.find((item) => item.kind === 'card')?.count ?? 0
  const attackPower = LESSON_PLAYER_BASE_DAMAGE + atkBonus + heroProfileRef.current.bonusAttack
  const zoneQuestDone = lessonZoneQuestDone(progress)
  const portalUnlocked = zoneQuestDone && lessonKillQuestDone(progress)
  const minimapPortalVisible = progress.zone !== 3 && portalUnlocked
  const questObjectives = lessonQuestObjectives(progress)

  // The minimap canvas is now the circular face of the compass frame art; pull the
  // percentage coordinates toward the center so edge-of-map blips stay inside the ring.
  const mmPos = (value: number) => 14 + value * 0.72

  const monsterVisual = (enemy: LessonEnemy) => enemy.skin
    ? <LessonAssetMonsterSprite skin={enemy.skin} mode={enemy.mode} direction={enemy.direction} frame={enemy.frame} />
    : enemy.species.body === 'lpc-archer'
    ? <span style={{ backgroundImage: `url(${archerSprite})`, backgroundPosition: `${-(enemy.frame % (enemy.mode === 'attack' || enemy.mode === 'windup' ? 13 : 9)) * 104}px ${-(enemy.mode === 'attack' || enemy.mode === 'windup' ? enemyAttackRows[enemy.direction] : enemyWalkRows[enemy.direction]) * 104}px` }} />
    : <span className="lesson-monster-svg"><LessonMonsterSprite body={enemy.species.body} mode={enemy.mode} direction={enemy.direction} /></span>

  const respawnAtCheckpoint = () => {
    if (deathChoiceTimer.current !== null) window.clearTimeout(deathChoiceTimer.current)
    deathChoiceTimer.current = null
    const zone = progress.zone === 1 ? 1 : 2
    const reset = createZoneEnemies(zone, activeMapSet)
    enemiesRef.current = reset
    setEnemies(reset)
    const spawn = LESSON_ZONE_CONFIGS[zone].playerSpawn
    positionRef.current = spawn
    setPosition(spawn)
    playerHpRef.current = heroProfileRef.current.maxHp
    setPlayerHp(heroProfileRef.current.maxHp)
    playerDeadRef.current = false
    setPlayerDead(false)
    setDeathChoiceOpen(false)
    setPlayerActionState('idle')
    setCombatNotice('ฟื้นคืนชีพแล้ว! ระวังตัวให้ดีกว่าเดิมนะผู้กล้า')
  }

  const leaveMapAfterDeath = () => {
    if (deathChoiceTimer.current !== null) window.clearTimeout(deathChoiceTimer.current)
    deathChoiceTimer.current = null
    closeLessonRun()
    void flushSessionRewards()
    onBack()
  }

  const exitGameAfterDeath = () => {
    if (deathChoiceTimer.current !== null) window.clearTimeout(deathChoiceTimer.current)
    deathChoiceTimer.current = null
    closeLessonRun()
    void flushSessionRewards()
    onExitGame?.()
  }

  return (
    <section id="page-lesson" style={{ display: paused ? 'none' : 'block' }} className={`lesson-adventure-page lesson-zone-${progress.zone}`}>
      <header className="lesson-adventure-hud">
        <button type="button" onClick={retreatToMap} aria-label="ถอยทัพกลับแผนที่">← แผนที่โลก</button>
        <div><small>บทเรียนผจญภัย</small><h2>{lesson.title}</h2><p>ภารกิจบทเรียน {questCount}/3</p></div>
        <button type="button" onClick={onOpenWorksheet}>📝 เปิดทำใบงาน</button>
      </header>

      <div className="lesson-topright-menu" data-testid="lesson-topright-menu">
        <button type="button" aria-label="กลับแผนที่โลกแบบย่อ" onClick={retreatToMap}>←</button>
        <button type="button" aria-label="ปุ่มลัดใบงาน" onClick={onOpenWorksheet}>📝</button>
      </div>

      <div className={`lesson-adventure-viewport${shaking ? ' lesson-shake' : ''}${playerDead ? ' lesson-world-dying' : ''}`}>
        <div ref={worldRef} data-testid="lesson-adventure-world" data-map-set={activeMapSet.id} className="lesson-adventure-world lesson-world-canvas" style={worldCanvasStyle} onPointerDown={moveToPointer} onMouseDown={moveToMouse}>
        <div data-testid="lesson-player" data-direction={direction} data-action={playerAction} className="lesson-player-sprite" style={playerStyle} aria-label="ตัวละครผู้เล่น">
          {playerAction === 'attack' && <span data-testid="lesson-slash-effect" className="lesson-player-slash" aria-hidden="true" />}
        </div>

        {progress.zone !== 3 && drops.map((drop) => (
          <button key={drop.id} type="button" aria-label={drop.kind === 'coin' ? `เก็บเหรียญ ${drop.amount}` : `เก็บ${LOOT_INFO[drop.kind].label}`} className={`lesson-ground-drop lesson-ground-drop-${drop.kind} lesson-drop-${LOOT_INFO[drop.kind].rarity}`} style={{ left: `${drop.x}%`, top: `${drop.y}%` }} onClick={() => pickupDrop(drop.id)}>
            <img src={LESSON_LOOT_IMAGES[drop.kind]} alt="" draggable={false} />
          </button>
        ))}

        {progress.zone === 1 && (
          <>
            {enemies.map((enemy) => (enemy.hp > 0 || enemy.mode === 'dead') && (
              <button key={enemy.id} type="button" aria-label={`โจมตีมอนสเตอร์ ${enemy.id}`} data-mode={enemy.mode} data-species={enemy.species.key} data-skin={enemy.skin} className={`lesson-monster lesson-monster-${enemy.id}`} style={{ left: `${enemy.x}%`, top: `${enemy.y}%` }} onClick={() => attackOrChaseEnemy(enemy.id)}>
                {monsterVisual(enemy)}
                <b>Lv.{enemy.species.level} {enemy.skin ? MONSTER_SKIN_NAMES[enemy.skin] : enemy.species.name}</b>
                <i><em style={{ width: `${(enemy.hp / enemy.species.maxHp) * 100}%` }} />{enemy.hp}/{enemy.species.maxHp}</i>
              </button>
            ))}
            {progress.noteDropped && !progress.noteRead && <button type="button" aria-label="เปิดโน้ตบทเรียน" className="lesson-drop-note" style={{ left: `${(notePickup || zoneConfig.landmark).x}%`, top: `${(notePickup || zoneConfig.landmark).y}%` }} onClick={() => setNoteOpen(true)}><img src={LESSON_SCROLL_IMAGE} alt="" draggable={false} /> เปิดโน้ตบทเรียน</button>}
            {portalUnlocked && <button type="button" aria-label="วาร์ปไปแมพ 2" className="lesson-portal" style={{ left: `${zoneConfig.portal.x}%`, top: `${zoneConfig.portal.y}%` }} onClick={() => enterZone(2)}><i aria-hidden="true" />วาร์ปไปแมพ 2 ✦</button>}
          </>
        )}

        {progress.zone === 2 && (
          <>
            {enemies.map((enemy) => (enemy.hp > 0 || enemy.mode === 'dead') && (
              <button key={enemy.id} type="button" aria-label={`โจมตีมอนสเตอร์เฝ้าหอ ${enemy.id}`} data-mode={enemy.mode} data-species={enemy.species.key} data-skin={enemy.skin} className={`lesson-monster archive-monster-${enemy.id}`} style={{ left: `${enemy.x}%`, top: `${enemy.y}%` }} onClick={() => attackOrChaseEnemy(enemy.id)}>
                {monsterVisual(enemy)}<b>Lv.{enemy.species.level} {enemy.skin ? MONSTER_SKIN_NAMES[enemy.skin] : enemy.species.name}</b>
                <i><em style={{ width: `${(enemy.hp / enemy.species.maxHp) * 100}%` }} />{enemy.hp}/{enemy.species.maxHp}</i>
              </button>
            ))}
            {progress.hasVideo && !progress.videoWatched && <button type="button" aria-label="เปิดตู้วิดีโอลับ" className="lesson-video-cabinet" style={{ left: `${zoneConfig.landmark.x}%`, top: `${zoneConfig.landmark.y}%` }} onClick={openVideo}><span>▶</span> เปิดตู้วิดีโอลับ</button>}
            {portalUnlocked && <button type="button" aria-label="วาร์ปไปแมพ 3" className="lesson-portal" style={{ left: `${zoneConfig.portal.x}%`, top: `${zoneConfig.portal.y}%` }} onClick={() => enterZone(3)}><i aria-hidden="true" />วาร์ปไปแมพ 3 ✦</button>}
          </>
        )}

        {progress.zone === 3 && (
          <div data-testid="lesson-boss-encounter" data-state={bossPhase} data-impact={bossImpact || undefined} data-action={bossPhase === 'skirmish' ? bossAction : undefined} data-enrage={bossPhase !== 'idle' && bossBattle.bossHp <= 30 ? 'true' : undefined} className="lesson-boss-encounter" style={{ left: `${bossPosition.x}%`, top: `${bossPosition.y}%` }}>
            <button type="button" data-testid="lesson-boss-target" aria-label="โจมตีบอสบทเรียนในแมพ" className="lesson-boss-target" onClick={bossPhase === 'skirmish' ? attackLessonBoss : () => void challengeLessonBoss()}>
              <span data-testid="lesson-boss-sprite" data-skin={activeMapSet.bossSkin} className="lesson-boss-sprite" style={bossSpriteStyle} aria-label="ผู้พิทักษ์บทเรียน">
                {activeMapSet.bossSkin && <LessonAssetMonsterSprite skin={activeMapSet.bossSkin} mode={bossAction === 'swing' ? 'attack' : 'chase'} direction={bossDirection} frame={bossFrame} renderSize={BOSS_SPRITE_RENDER_SIZE} />}
              </span>
            </button>
            {bossPhase === 'idle' && <button type="button" data-testid="lesson-boss-challenge" aria-label="ท้าทายบอสบทเรียน" onClick={() => void challengeLessonBoss()}>⚔ ท้าทายบอสบทเรียน</button>}
            {bossPhase === 'loading' && <div data-testid="lesson-boss-hud" className="lesson-boss-hud">กำลังปลุกพลังบอส...</div>}
            {(bossPhase === 'skirmish' || bossPhase === 'question' || bossPhase === 'result') && (
              <div data-testid="lesson-boss-hud" className="lesson-boss-hud">
                <b>บอสบทเรียน</b><span><i style={{ width: `${Math.max(0, bossBattle.bossHp)}%` }} /></span><strong>{Math.ceil(Math.max(0, bossBattle.bossHp))}/100</strong>
                <small>คำถามเหลือ {bossRemainingQuestionIndexes.length}/{bossQuestions.length} · จังหวะฟัน {bossHits}/{BOSS_HITS_PER_QUESTION}</small>
              </div>
            )}
            {bossPhase === 'error' && <div data-testid="lesson-boss-hud" className="lesson-boss-hud error">{bossError}</div>}
          </div>
        )}

        {progress.zone === 3 && (bossPhase === 'skirmish' || bossPhase === 'question' || bossPhase === 'result') && (
          <div className="lesson-boss-topbar" aria-hidden="true">
            <b>บอสบทเรียน</b>
            <span><i style={{ width: `${Math.max(0, bossBattle.bossHp)}%` }} /></span>
            <small>คำถามเหลือ {bossRemainingQuestionIndexes.length}/{bossQuestions.length} · จังหวะฟัน {bossHits}/{BOSS_HITS_PER_QUESTION}</small>
          </div>
        )}

        {portalUnlocked && progress.zone !== 3 && (
          <span
            data-testid="lesson-portal-guide"
            className="lesson-portal-guide"
            aria-hidden="true"
            style={{ left: `${position.x}%`, top: `${position.y - 11}%`, transform: `translate(-50%, -50%) rotate(${guideAngleDeg(position, zoneConfig.portal)}deg)` }}
          >➤</span>
        )}

        {floatingTexts.map((entry) => (
          <span key={entry.id} data-testid="combat-float" className={`combat-float combat-float-${entry.kind}`} style={{ left: `${entry.x}%`, top: `${entry.y}%` }}>{entry.text}</span>
        ))}
        {hitSparks.map((spark) => (
          <span key={spark.id} data-testid="hit-spark" className={`lesson-hit-spark${spark.crit ? ' crit' : ''}`} style={{ left: `${spark.x}%`, top: `${spark.y}%` }} aria-hidden="true" />
        ))}
        </div>

        <div className="lesson-world-vignette" />
        <aside className={`lesson-quest-card${questOpen ? '' : ' collapsed'}`}>
          <button
            type="button"
            className="lesson-quest-toggle"
            aria-label={questOpen ? 'ย่อหน้าต่างเควส' : 'ขยายหน้าต่างเควส'}
            onClick={() => setQuestOpen((open) => !open)}
          >
            {questOpen ? '‹' : (
              <>
                <img src={LESSON_SCROLL_IMAGE} alt="" draggable={false} />
                <span>
                  <b>{questTitleFor(progress)}</b>
                  {/* Compact at-a-glance progress; the full detail panel opens on tap. */}
                  <small>{portalUnlocked && progress.zone !== 3
                    ? '✓ เควสสำเร็จ! เดินเข้าวาร์ปไปต่อ'
                    : progress.zone === 3
                      ? 'ปราบบอสให้สำเร็จ!'
                      : questObjectives.map((objective) => `${objective.label} (${objective.current}/${objective.target})`).join(', ')}</small>
                </span>
              </>
            )}
          </button>
          {questOpen && (
            <div className="lesson-quest-body">
              <span>พื้นที่ {progress.zone}/3</span>
              <h3>{questTitleFor(progress)}</h3>
              {progress.zone === 1 && <p>{lesson.description || 'กำจัดผู้พิทักษ์เงา ค้นหาโน้ต และอ่านเนื้อหาให้จบ'}</p>}
              {progress.zone === 2 && <p>สำรวจหอจดหมายเหตุ ฝ่ามอนสเตอร์ และค้นหาตู้วิดีโอที่ซ่อนอยู่</p>}
              {progress.zone === 3 && <p>ตอบคำถามให้ถูกเพื่อสะท้อนสกิลรุนแรงกลับไปยังบอส</p>}
              {questObjectives.length > 0 && (
                <ul className="lesson-quest-objectives" data-testid="lesson-quest-objectives">
                  {questObjectives.map((objective) => (
                    <li key={objective.id} className={objective.done ? 'done' : ''}>
                      <span aria-hidden="true">{objective.done ? '✅' : '☐'}</span>
                      {objective.label} ({objective.current}/{objective.target})
                    </li>
                  ))}
                </ul>
              )}
              {portalUnlocked && progress.zone !== 3 && (
                <div className="lesson-quest-complete" data-testid="lesson-quest-complete">
                  ✓ เควสสำเร็จ! เดินตามลูกศรเข้าวาร์ปไปแมพถัดไป
                </div>
              )}
              <small className="lesson-quest-lesson-title">{lesson.title} · ภารกิจบทเรียน {questCount}/3</small>
            </div>
          )}
        </aside>

        <div className="lesson-minimap" data-testid="lesson-minimap" aria-hidden="true">
          <b>◆ แผนที่ย่อ {progress.zone}/3</b>
          <div className="lesson-minimap-canvas">
            {progress.zone !== 3 && enemies.filter((enemy) => enemy.hp > 0).map((enemy) => (
              <i key={enemy.id} className="mm-dot mm-enemy" style={{ left: `${mmPos(enemy.x)}%`, top: `${mmPos(enemy.y)}%` }} />
            ))}
            {progress.zone === 3 && <i className="mm-dot mm-boss" style={{ left: `${mmPos(bossPosition.x)}%`, top: `${mmPos(bossPosition.y)}%` }} />}
            {progress.zone !== 3 && drops.map((drop) => (
              <i key={drop.id} className="mm-dot mm-drop" style={{ left: `${mmPos(drop.x)}%`, top: `${mmPos(drop.y)}%` }} />
            ))}
            {minimapPortalVisible && <i className="mm-dot mm-portal" style={{ left: `${mmPos(zoneConfig.portal.x)}%`, top: `${mmPos(zoneConfig.portal.y)}%` }} />}
            {progress.zone === 1 && progress.noteDropped && !progress.noteRead && <i className="mm-dot mm-quest" style={{ left: `${mmPos((notePickup || zoneConfig.landmark).x)}%`, top: `${mmPos((notePickup || zoneConfig.landmark).y)}%` }} />}
            {progress.zone === 2 && progress.hasVideo && !progress.videoWatched && <i className="mm-dot mm-quest" style={{ left: `${mmPos(zoneConfig.landmark.x)}%`, top: `${mmPos(zoneConfig.landmark.y)}%` }} />}
            <i className="mm-dot mm-player" style={{ left: `${mmPos(position.x)}%`, top: `${mmPos(position.y)}%` }} />
          </div>
        </div>

        {/* Hidden during the boss question/result panels only — those are
            centered and can reach edge-to-edge on narrower screens, which
            would otherwise sit under this top-right widget. */}
        {!(bossPhase === 'question' || bossPhase === 'result') && (
          <TeacherQuestTracker
            tracked={trackedTeacherQuest}
            onClick={() => { retreatToMap(); onOpenNpc?.() }}
            variant="lesson"
            testId="lesson-npc-tracker"
          />
        )}

        <div className="lesson-loot-feed" data-testid="lesson-loot-feed" aria-live="polite">
          {lootFeed.map((entry) => (
            <span key={entry.id} className={`lesson-loot-entry lesson-loot-${entry.rarity}`}><img src={LESSON_LOOT_IMAGES[entry.kind]} alt="" /> ได้รับ {entry.text}</span>
          ))}
        </div>

        {combo.count >= 2 && <div className="lesson-combo-badge" data-testid="lesson-combo">⚡ x{combo.count} COMBO!</div>}

        <div className="lesson-status-hud" data-testid="lesson-status-hud">
          <button type="button" className="lesson-status-avatar" aria-label="เปิดโปรไฟล์ตัวละคร" onClick={openCharPanel}>
            <span className="lesson-avatar-sprite" style={heroPortraitStyle(44)} aria-hidden="true" />
          </button>
          <div className="lesson-status-bars">
            <b>Lv.{xpProgress.level} ผู้กล้า</b>
            <span className="lesson-bar-row">
              <img className="lesson-bar-badge" src={LESSON_BAR_BADGE_IMAGES.hp} alt="" draggable={false} />
              <span className="lesson-bar lesson-bar-hp"><i style={{ width: `${(displayedPlayerHp / displayedMaxHp) * 100}%` }} /><em>HP {displayedPlayerHp}/{displayedMaxHp}</em></span>
            </span>
            <span className="lesson-bar-row">
              <img className="lesson-bar-badge" src={LESSON_BAR_BADGE_IMAGES.sp} alt="" draggable={false} />
              <span className="lesson-bar lesson-bar-sp"><i style={{ width: `${(sp / LESSON_SP_MAX) * 100}%` }} /><em>SP {sp}/{LESSON_SP_MAX}</em></span>
            </span>
            <span className="lesson-bar-row">
              <img className="lesson-bar-badge" src={LESSON_BAR_BADGE_IMAGES.xp} alt="" draggable={false} />
              <span className="lesson-bar lesson-bar-xp"><i style={{ width: `${xpProgress.percent}%` }} /><em>EXP {xpProgress.intoLevel}/{xpProgress.requiredXp || 'MAX'}</em></span>
            </span>
            <small><img className="lesson-stat-icon" src={LESSON_STAT_IMAGES.attack} alt="" /> ATK {attackPower}{atkBonus > 0 ? ` (+${atkBonus})` : ''} · <img className="lesson-stat-icon" src={LESSON_STAT_IMAGES.coin} alt="" /> {coinCount}</small>
          </div>
        </div>

        {levelUpLevel !== null && (
          <div className="lesson-level-up-burst" data-testid="lesson-level-up">
            <b>LEVEL UP!</b>
            <span>Lv.{levelUpLevel}</span>
            <small>พลังชีวิตฟื้นเต็ม · แต้มสเตตัส +3</small>
          </div>
        )}

        <button type="button" aria-label="เปิดกระเป๋า" className="lesson-bag-button" onClick={openGlobalBag}><img src={bagOpen ? LESSON_CHEST_IMAGES.open : LESSON_CHEST_IMAGES.closed} alt="" draggable={false} />{bag.length > 0 && <em>{bag.length}</em>}</button>

        {(progress.zone === 1 || progress.zone === 2) && (
          <div className="lesson-hotbar" data-testid="lesson-hotbar">
            <button type="button" className="lesson-hotbar-attack lesson-slot-attack" aria-label="โจมตีด้วยดาบ" onClick={() => attackNearest()}><img src={LESSON_HOTBAR_IMAGES.attack} alt="" draggable={false} /><b>โจมตี</b><small>Space</small></button>
            <button type="button" className="lesson-hotbar-skill lesson-slot-skill" aria-label="สกิลฟันหนัก" disabled={sp < LESSON_SKILL_SP_COST} onClick={() => attackNearest(undefined, true)}><img src={LESSON_HOTBAR_IMAGES.skill} alt="" draggable={false} /><b>ฟันหนัก</b><small>E · {LESSON_SKILL_SP_COST} SP</small></button>
            <button type="button" className="lesson-hotbar-item lesson-slot-potion" aria-label="ใช้ยาฟื้นฟู" disabled={potionCount === 0} onClick={usePotion}><img src={LESSON_HOTBAR_IMAGES.potion} alt="" draggable={false} /><b>ยา</b><small>1</small>{potionCount > 0 && <em>{potionCount}</em>}</button>
            <button type="button" className="lesson-hotbar-item lesson-slot-card" aria-label="ใช้การ์ดมอนสเตอร์" disabled={cardCount === 0} onClick={useMonsterCard}><img src={LESSON_HOTBAR_IMAGES.card} alt="" draggable={false} /><b>การ์ด</b><small>2</small>{cardCount > 0 && <em>{cardCount}</em>}</button>
            <button type="button" className={`lesson-hotbar-auto ${autoBattle ? 'active' : ''}`} aria-label="สลับโหมดโจมตีอัตโนมัติ" aria-pressed={autoBattle} onClick={toggleAutoBattle}><span aria-hidden="true">🤖</span><b>ออโต้</b><small>R</small></button>
          </div>
        )}
        {(progress.zone === 1 || progress.zone === 2) && (
          <div className="lesson-joystick-dock">
            <VirtualJoystick label="จอยสติ๊กควบคุมตัวละคร" onDirection={(direction) => (direction ? startHeldMove(direction) : stopHeldMove())} />
          </div>
        )}
        {progress.zone === 3 && bossPhase === 'skirmish' && (
          <div className="lesson-hotbar lesson-boss-hotbar" data-testid="lesson-boss-hotbar">
            <button type="button" className="lesson-hotbar-attack lesson-slot-attack" data-testid="lesson-boss-attack-button" aria-label="โจมตีบอสด้วยดาบ" onClick={attackLessonBoss}><img src={LESSON_HOTBAR_IMAGES.attack} alt="" draggable={false} /><b>โจมตีบอส</b><small>Space · ครบ {BOSS_HITS_PER_QUESTION} จังหวะ</small></button>
            <button type="button" className="lesson-hotbar-item lesson-slot-potion" aria-label="ใช้ยาฟื้นฟู" disabled={potionCount === 0} onClick={usePotion}><img src={LESSON_HOTBAR_IMAGES.potion} alt="" draggable={false} /><b>ยา</b><small>1</small>{potionCount > 0 && <em>{potionCount}</em>}</button>
            <button type="button" className={`lesson-hotbar-auto ${autoBattle ? 'active' : ''}`} aria-label="สลับโหมดโจมตีอัตโนมัติ" aria-pressed={autoBattle} onClick={toggleAutoBattle}><span aria-hidden="true">🤖</span><b>ออโต้</b><small>R</small></button>
          </div>
        )}
        {autoBattle && !playerDead && <div className="lesson-auto-chip" aria-hidden="true"><i>🤖</i> AUTO</div>}
        {combatNotice && (progress.zone !== 3 || bossPhase === 'skirmish') && <p className="lesson-combat-notice">{combatNotice}</p>}
        {progress.zone === 3 && bossPhase === 'question' && currentBossQuestion && (
          <div data-testid="lesson-boss-question-panel" className="lesson-boss-question-panel">
            <small>สกิลคำถามบอส · ข้อที่ {bossQuestions.length - bossRemainingQuestionIndexes.length + 1}/{bossQuestions.length}</small>
            <h3>{currentBossQuestion.text}</h3>
            {currentBossQuestion.image && <img src={currentBossQuestion.image} alt="ภาพประกอบคำถามบอส" />}
            <QuizQuestionView question={currentBossQuestion} variant="boss" onAnswer={answerBossQuestion} />
          </div>
        )}
        {progress.zone === 3 && bossPhase === 'result' && bossResult && (
          <div data-testid="lesson-boss-result-panel" className="lesson-boss-result-panel">
            {bossResult.passed
              ? <img className="lesson-boss-reward-chest" src={LESSON_CHEST_IMAGES.legendary} alt="หีบสมบัติรางวัลปราบบอส" />
              : <span>💀</span>}
            <h3>{bossResult.passed ? 'ปราบบอสบทเรียนสำเร็จ!' : 'ยังไม่ผ่านบอสบทเรียน'}</h3>
            <p>ตอบถูก {bossResult.score}/{bossResult.total} ข้อ · {bossResult.stars} ดาว</p>
            <p>{bossResult.reason}</p>
            {bossResult.stats && <b>ได้รับ +{bossResult.stats.gainedXp} XP</b>}
            {bossResult.stats && bossUser && bossResult.stats.level > bossUser.level && (
              <p className="lesson-boss-level-up">🎉 LEVEL UP! เลเวล {bossResult.stats.level} — ไปเพิ่มแต้มสเตตัสที่หน้าโปรไฟล์ได้เลย</p>
            )}
            {bossResult.saveError && <em>{bossResult.saveError}</em>}
            <button type="button" onClick={retreatToMap}>กลับแผนที่ผจญภัย</button>
          </div>
        )}
        <div className="lesson-move-hint">คลิกพื้นหรือ WASD เดิน · Space โจมตี · E สกิลฟันหนัก · 1 ยา / 2 การ์ด · เดินชนวาร์ปเพื่อไปแมพถัดไป</div>
      </div>

      {noteOpen && (
        <div className="lesson-modal-backdrop" role="dialog" aria-modal="true" aria-label="โน้ตเนื้อหาบทเรียน">
          <article className="lesson-note-modal">
            <header className="lesson-note-header" data-testid="lesson-note-header">
              <img className="lesson-note-scroll" src={LESSON_SCROLL_IMAGE} alt="" />
              <small>ไอเทมเนื้อหาบทเรียน</small>
              <h3>{lesson.title}</h3>
              {hasWorksheet && <p data-testid="lesson-note-worksheet-badge" className="lesson-note-worksheet-badge"><i aria-hidden="true">✦</i> บทนี้มีใบงาน <span>รับรางวัลการเรียนรู้เมื่อส่งสำเร็จ</span></p>}
            </header>
            <div className="lesson-note-content">{lesson.content || lesson.description || 'อ่านเนื้อหาบทเรียนนี้ให้จบก่อนเดินทางต่อ'}</div>
            <div className="lesson-note-actions">
              <button type="button" onClick={() => { setProgress(readLessonNote); setNoteOpen(false) }}>อ่านจบแล้ว</button>
              {hasWorksheet && <button type="button" className="lesson-note-worksheet-button" aria-label="ทำใบงานบทนี้" onClick={onOpenWorksheet}><span aria-hidden="true">📝</span> ทำใบงานบทนี้ <em>พร้อมแล้ว</em></button>}
            </div>
          </article>
        </div>
      )}

      {videoOpen && (
        <div className="lesson-modal-backdrop" role="dialog" aria-modal="true" aria-label="วิดีโอเนื้อหาบทเรียน">
          <article className="lesson-video-modal">
            <button type="button" className="lesson-modal-close" aria-label="ปิดวิดีโอ" onClick={() => setVideoOpen(false)}>×</button>
            <h3>ตู้บันทึกความรู้: {lesson.title}</h3>
            {directVideo && lesson.videoUrl
              ? <video src={lesson.videoUrl} aria-label={`วิดีโอบทเรียน${lesson.title}`} controls onEnded={() => setVideoReady(true)} />
              : embedUrl
                ? <iframe ref={videoFrameRef} id="lesson-video-frame" src={embedUrl} title={`วิดีโอบทเรียน ${lesson.title}`} allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen onLoad={() => videoFrameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'lesson-video-frame' }), 'https://www.youtube.com')} />
                : <div className="lesson-video-missing">🎬 ยังไม่ได้กำหนดวิดีโอสำหรับบทเรียนนี้</div>}
            <p>{videoReady ? 'ตรวจสอบการรับชมแล้ว พร้อมเดินทางต่อ' : 'รับชมวิดีโอให้จบ แล้วกดยืนยันด้วยตนเองเพื่อปลดผนึกประตูวาร์ป'}</p>
            <button type="button" onClick={() => { setProgress(finishLessonVideo); setVideoOpen(false) }}>ยืนยันว่าดูวิดีโอจบแล้ว</button>
          </article>
        </div>
      )}

      {deathChoiceOpen && (
        <div className="ro-death-backdrop" role="dialog" aria-modal="true" aria-label="ตัวเลือกหลังพ่ายแพ้">
          <article className="ro-death-panel">
            <span className="ro-death-skull" aria-hidden="true">💀</span>
            <h3>ผู้กล้าล้มลง...</h3>
            <p>เลือกเส้นทางต่อไปของคุณ</p>
            <button type="button" aria-label="ฟื้นฟูจุดเริ่มต้น" className="ro-death-respawn" onClick={respawnAtCheckpoint}>🕊️ ฟื้นฟูจุดเริ่มต้น</button>
            <button type="button" aria-label="ออกจากแผนที่" className="ro-death-leave" onClick={leaveMapAfterDeath}><img src={LESSON_DEATH_PANEL_IMAGES.map} alt="" className="ro-death-btn-icon" draggable={false} /> ออกจากแผนที่</button>
            <button type="button" aria-label="ออกจากเกมส์" className="ro-death-exit" onClick={exitGameAfterDeath}>🚪 ออกจากเกมส์</button>
          </article>
        </div>
      )}
    </section>
  )
}
