import type { LessonEnemyMode } from './lessonCombatLogic'
import type { LessonMonsterSkinKey } from './lessonMapSets'
import orcIdle from '../assets/lesson-monsters/tiny-orc/idle.png'
import orcWalk from '../assets/lesson-monsters/tiny-orc/walk.png'
import orcAttack from '../assets/lesson-monsters/tiny-orc/attack.png'
import orcHurt from '../assets/lesson-monsters/tiny-orc/hurt.png'
import orcDeath from '../assets/lesson-monsters/tiny-orc/death.png'
import demonIdle from '../assets/lesson-monsters/tiny-demon/idle.png'
import demonWalk from '../assets/lesson-monsters/tiny-demon/walk.png'
import demonAttack from '../assets/lesson-monsters/tiny-demon/attack.png'
import demonHurt from '../assets/lesson-monsters/tiny-demon/hurt.png'
import demonDeath from '../assets/lesson-monsters/tiny-demon/death.png'
import bloodIdle from '../assets/lesson-monsters/tiny-blood/idle.png'
import bloodWalk from '../assets/lesson-monsters/tiny-blood/walk.png'
import bloodAttack from '../assets/lesson-monsters/tiny-blood/attack.png'
import bloodHurt from '../assets/lesson-monsters/tiny-blood/hurt.png'
import bloodDeath from '../assets/lesson-monsters/tiny-blood/death.png'
import mushroomIdle from '../assets/lesson-monsters/forest-mushroom/idle.png'
import mushroomMove from '../assets/lesson-monsters/forest-mushroom/move.png'
import mushroomAttack from '../assets/lesson-monsters/forest-mushroom/attack.png'
import mushroomHurt from '../assets/lesson-monsters/forest-mushroom/hurt.png'
import mushroomDeath from '../assets/lesson-monsters/forest-mushroom/death.png'
import flyerIdle from '../assets/lesson-monsters/forest-flyer/idle.png'
import flyerMove from '../assets/lesson-monsters/forest-flyer/move.png'
import flyerAttack from '../assets/lesson-monsters/forest-flyer/attack.png'
import flyerHurt from '../assets/lesson-monsters/forest-flyer/hurt.png'
import flyerDeath from '../assets/lesson-monsters/forest-flyer/death.png'

export type MonsterAnimation = {
  animation: 'idle' | 'walk' | 'move' | 'attack' | 'hurt' | 'death'
  image: string
  frames: number
  frameWidth: number
  frameHeight: number
}

type MonsterAnimationSet = Record<'idle' | 'move' | 'attack' | 'hurt' | 'death', MonsterAnimation>

const tinyAnimation = (animation: MonsterAnimation['animation'], image: string, frames: number): MonsterAnimation => ({ animation, image, frames, frameWidth: 100, frameHeight: 100 })
const forestAnimation = (animation: MonsterAnimation['animation'], image: string, frames: number, frameWidth = 64): MonsterAnimation => ({ animation, image, frames, frameWidth, frameHeight: 64 })

const EXTERNAL_MONSTER_ANIMATIONS: Record<LessonMonsterSkinKey, MonsterAnimationSet> = {
  'tiny-orc': {
    idle: tinyAnimation('idle', orcIdle, 6), move: tinyAnimation('walk', orcWalk, 8), attack: tinyAnimation('attack', orcAttack, 6),
    hurt: tinyAnimation('hurt', orcHurt, 4), death: tinyAnimation('death', orcDeath, 4),
  },
  'tiny-demon': {
    idle: tinyAnimation('idle', demonIdle, 6), move: tinyAnimation('walk', demonWalk, 8), attack: tinyAnimation('attack', demonAttack, 7),
    hurt: tinyAnimation('hurt', demonHurt, 4), death: tinyAnimation('death', demonDeath, 4),
  },
  'tiny-blood': {
    idle: tinyAnimation('idle', bloodIdle, 6), move: tinyAnimation('walk', bloodWalk, 8), attack: tinyAnimation('attack', bloodAttack, 8),
    hurt: tinyAnimation('hurt', bloodHurt, 4), death: tinyAnimation('death', bloodDeath, 4),
  },
  'forest-mushroom': {
    idle: forestAnimation('idle', mushroomIdle, 7, 80), move: forestAnimation('move', mushroomMove, 8, 80), attack: forestAnimation('attack', mushroomAttack, 10, 80),
    hurt: forestAnimation('hurt', mushroomHurt, 5, 80), death: forestAnimation('death', mushroomDeath, 15, 80),
  },
  'forest-flyer': {
    idle: forestAnimation('idle', flyerIdle, 8), move: forestAnimation('move', flyerMove, 8), attack: forestAnimation('attack', flyerAttack, 12),
    hurt: forestAnimation('hurt', flyerHurt, 4), death: forestAnimation('death', flyerDeath, 17),
  },
}

export function monsterAnimationFor(skin: LessonMonsterSkinKey, mode: LessonEnemyMode): MonsterAnimation {
  const animations = EXTERNAL_MONSTER_ANIMATIONS[skin]
  if (mode === 'dead') return animations.death
  if (mode === 'hurt') return animations.hurt
  if (mode === 'attack' || mode === 'windup') return animations.attack
  if (mode === 'chase' || mode === 'patrol') return animations.move
  return animations.idle
}
