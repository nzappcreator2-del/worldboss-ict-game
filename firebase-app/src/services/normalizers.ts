import { serverTimestamp } from 'firebase/firestore'
import { levelForXp } from './levelSystem'

export type UserRecord = Record<string, unknown>

// Body type chosen at registration; drives which base spritesheet renders.
// '' = account created before genders existed -> keeps the legacy hero base.
export type StudentGender = 'male' | 'female'

export function normalizeGender(value: unknown): StudentGender | '' {
  return value === 'male' || value === 'female' ? value : ''
}

// Reduced public profile mirrored into /directory next to every relevant user
// change. Never include coins/inventory/ownerUid/lastLogin here.
export function directoryEntry(user: UserRecord): UserRecord {
  return {
    name: String(user.name || ''),
    class: String(user.class || ''),
    avatar: String(user.avatar || '🧙‍♂️'),
    xp: Number(user.xp) || 0,
    level: Number(user.level) || 1,
    rank: String(user.rank || 'BRONZE'),
    updatedAt: serverTimestamp(),
  }
}

export function normalizeCyberScenario(id: string, value: Record<string, unknown>) {
  const migratedSheetShape = value.scenarioText !== undefined || value.scenarioId !== undefined
  const rawAnswer = Number(value.answerIdx)

  return {
    ...value,
    id: String(value.scenarioId || id),
    timeOfDay: String(value.timeOfDay || ''),
    title: String(value.title || ''),
    text: String(value.text || value.scenarioText || ''),
    opt1: String(value.opt1 || ''),
    opt2: String(value.opt2 || ''),
    answerIdx: migratedSheetShape ? Math.max(0, rawAnswer - 1) : Math.max(0, rawAnswer || 0),
    feedbackWrong: String(value.feedbackWrong || ''),
    feedbackRight: String(value.feedbackRight || ''),
    imageSvg: String(value.imageSvg || ''),
  }
}

export function rankForXp(rawXp: unknown): string {
  const xp = Number(rawXp) || 0
  if (xp >= 10000) return 'GRANDMASTER'
  if (xp >= 5000) return 'MASTER'
  if (xp >= 2500) return 'DIAMOND'
  if (xp >= 1200) return 'PLATINUM'
  if (xp >= 600) return 'GOLD'
  if (xp >= 300) return 'SILVER'
  return 'BRONZE'
}

export function normalizeUser(id: string, value: UserRecord) {
  const xp = Number(value.xp) || 0
  
  let rawInventory = value.inventory
  if (typeof rawInventory === 'string') {
    try {
      rawInventory = JSON.parse(rawInventory)
    } catch {
      rawInventory = null
    }
  }

  const inventory = rawInventory && typeof rawInventory === 'object'
    ? rawInventory
    : { potion: 0, magnifier: 0 }

  return {
    ...value,
    id,
    name: String(value.name || ''),
    class: String(value.class || ''),
    xp,
    level: Number(value.level) || levelForXp(xp),
    rank: String(value.rank || rankForXp(xp)),
    avatar: String(value.avatar || '🧙‍♂️'),
    gender: normalizeGender(value.gender),
    coins: Number(value.coins) || 0,
    streak: Number(value.streak) || 0,
    inventory,
    lastLogin: value.lastLogin || '',
  }
}
