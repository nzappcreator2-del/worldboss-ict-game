import legacyZone1 from '../assets/lesson-zone-forest.webp'
import legacyZone2 from '../assets/lesson-zone-archive.webp'
import legacyZone3 from '../assets/lesson-zone-boss.webp'
import mushroomZone1 from '../assets/lesson-map-sets/mushroom-grove/zone-1.webp'
import mushroomZone2 from '../assets/lesson-map-sets/mushroom-grove/zone-2-archive.webp'
import mushroomZone3 from '../assets/lesson-map-sets/mushroom-grove/zone-3-boss.webp'
import desertZone1 from '../assets/lesson-map-sets/desert-ruins/zone-1.webp'
import desertZone2 from '../assets/lesson-map-sets/desert-ruins/zone-2-archive.webp'
import desertZone3 from '../assets/lesson-map-sets/desert-ruins/zone-3-boss.webp'
import frostZone1 from '../assets/lesson-map-sets/frost-kingdom/zone-1.webp'
import frostZone2 from '../assets/lesson-map-sets/frost-kingdom/zone-2-archive.webp'
import frostZone3 from '../assets/lesson-map-sets/frost-kingdom/zone-3-boss.webp'
import volcanicZone1 from '../assets/lesson-map-sets/volcanic-forge/zone-1.webp'
import volcanicZone2 from '../assets/lesson-map-sets/volcanic-forge/zone-2-archive.webp'
import volcanicZone3 from '../assets/lesson-map-sets/volcanic-forge/zone-3-boss.webp'
import skyZone1 from '../assets/lesson-map-sets/sky-temple/zone-1.webp'
import skyZone2 from '../assets/lesson-map-sets/sky-temple/zone-2-archive.webp'
import skyZone3 from '../assets/lesson-map-sets/sky-temple/zone-3-boss.webp'
import coralZone1 from '../assets/lesson-map-sets/coral-kingdom/zone-1.webp'
import coralZone2 from '../assets/lesson-map-sets/coral-kingdom/zone-2-archive.webp'
import coralZone3 from '../assets/lesson-map-sets/coral-kingdom/zone-3-boss.webp'
import hauntedZone1 from '../assets/lesson-map-sets/haunted-marsh/zone-1.webp'
import hauntedZone2 from '../assets/lesson-map-sets/haunted-marsh/zone-2-archive.webp'
import hauntedZone3 from '../assets/lesson-map-sets/haunted-marsh/zone-3-boss.webp'

export type LessonZone = 1 | 2 | 3
export type LessonMapSetId =
  | 'legacy-forest'
  | 'mushroom-grove'
  | 'desert-ruins'
  | 'frost-kingdom'
  | 'volcanic-forge'
  | 'sky-temple'
  | 'coral-kingdom'
  | 'haunted-marsh'

export type LessonMonsterSkinKey = 'tiny-orc' | 'tiny-demon' | 'tiny-blood' | 'forest-mushroom' | 'forest-flyer'

export type LessonMapSet = {
  id: LessonMapSetId
  name: string
  description: string
  zoneImages: Record<LessonZone, string>
  zoneMonsterSkins: Partial<Record<1 | 2, LessonMonsterSkinKey[]>>
  bossSkin?: LessonMonsterSkinKey
}

const legacyImages = { 1: legacyZone1, 2: legacyZone2, 3: legacyZone3 } as const
const mushroomImages = { 1: mushroomZone1, 2: mushroomZone2, 3: mushroomZone3 } as const
const desertImages = { 1: desertZone1, 2: desertZone2, 3: desertZone3 } as const
const frostImages = { 1: frostZone1, 2: frostZone2, 3: frostZone3 } as const
const volcanicImages = { 1: volcanicZone1, 2: volcanicZone2, 3: volcanicZone3 } as const
const skyImages = { 1: skyZone1, 2: skyZone2, 3: skyZone3 } as const
const coralImages = { 1: coralZone1, 2: coralZone2, 3: coralZone3 } as const
const hauntedImages = { 1: hauntedZone1, 2: hauntedZone2, 3: hauntedZone3 } as const

export const LESSON_MAP_SETS: LessonMapSet[] = [
  { id: 'legacy-forest', name: 'Original Forest', description: 'ป่า หอจดหมายเหตุ และลานบอสดั้งเดิม', zoneImages: legacyImages, zoneMonsterSkins: {} },
  { id: 'mushroom-grove', name: 'Mushroom Grove', description: 'ป่าเห็ดเรืองแสงและหอสมุดไมซีเลียม', zoneImages: mushroomImages, zoneMonsterSkins: { 1: ['forest-mushroom', 'forest-flyer'], 2: ['tiny-orc', 'forest-flyer'] }, bossSkin: 'tiny-blood' },
  { id: 'desert-ruins', name: 'Desert Ruins', description: 'โอเอซิส หอจารึก และสนามสุริยะ', zoneImages: desertImages, zoneMonsterSkins: { 1: ['tiny-orc', 'tiny-blood'], 2: ['tiny-orc', 'tiny-demon'] }, bossSkin: 'tiny-demon' },
  { id: 'frost-kingdom', name: 'Frost Kingdom', description: 'ภูเขาหิมะ หอสมุดน้ำแข็ง และบัลลังก์น้ำแข็ง', zoneImages: frostImages, zoneMonsterSkins: { 1: ['forest-flyer', 'tiny-orc'], 2: ['tiny-blood', 'forest-flyer'] }, bossSkin: 'tiny-blood' },
  { id: 'volcanic-forge', name: 'Volcanic Forge', description: 'โรงหลอม คลังออบซิเดียน และลานลาวา', zoneImages: volcanicImages, zoneMonsterSkins: { 1: ['tiny-demon', 'tiny-blood'], 2: ['tiny-orc', 'tiny-demon'] }, bossSkin: 'tiny-demon' },
  { id: 'sky-temple', name: 'Sky Temple', description: 'เกาะลอยฟ้า หอดูดาว และสนามพายุ', zoneImages: skyImages, zoneMonsterSkins: { 1: ['forest-flyer', 'tiny-orc'], 2: ['forest-flyer', 'tiny-demon'] }, bossSkin: 'tiny-blood' },
  { id: 'coral-kingdom', name: 'Coral Kingdom', description: 'นครปะการัง หอแห่งสายน้ำ และวิหารใต้สมุทร', zoneImages: coralImages, zoneMonsterSkins: { 1: ['forest-mushroom', 'forest-flyer'], 2: ['tiny-blood', 'tiny-orc'] }, bossSkin: 'tiny-orc' },
  { id: 'haunted-marsh', name: 'Haunted Marsh', description: 'บึงหมอก หอคัมภีร์สุสาน และลานพิธีกรรม', zoneImages: hauntedImages, zoneMonsterSkins: { 1: ['tiny-blood', 'forest-flyer'], 2: ['tiny-demon', 'tiny-blood'] }, bossSkin: 'tiny-demon' },
]

const MAP_SET_BY_ID = new Map(LESSON_MAP_SETS.map((set) => [set.id, set]))
export const LEGACY_LESSON_MAP_SET = LESSON_MAP_SETS[0]

function lessonIndex(lessonId: string): number {
  const numeric = String(lessonId || '').match(/(\d+)$/)
  if (numeric) return Math.max(0, Number(numeric[1]) - 1)
  let hash = 0
  for (const char of String(lessonId || 'legacy')) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0
  return hash
}

export function resolveLessonMapSet(selection: string | undefined, lessonId: string): LessonMapSet {
  if (selection === 'auto') return LESSON_MAP_SETS[lessonIndex(lessonId) % LESSON_MAP_SETS.length]
  return MAP_SET_BY_ID.get(selection as LessonMapSetId) || LEGACY_LESSON_MAP_SET
}

export function monsterSkinForSpawn(set: LessonMapSet, zone: 1 | 2, spawnIndex: number): LessonMonsterSkinKey | undefined {
  const pool = set.zoneMonsterSkins[zone]
  if (!pool?.length) return undefined
  return pool[((spawnIndex % pool.length) + pool.length) % pool.length]
}

export const MONSTER_SKIN_NAMES: Record<LessonMonsterSkinKey, string> = {
  'tiny-orc': 'นักรบออร์ค',
  'tiny-demon': 'อสูรเงา',
  'tiny-blood': 'อสูรโลหิต',
  'forest-mushroom': 'เห็ดพิทักษ์ป่า',
  'forest-flyer': 'วิญญาณพฤกษาบิน',
}
