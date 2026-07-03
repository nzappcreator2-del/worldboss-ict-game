export type Inventory = Record<string, unknown>

const SERVER_PRICES: Record<string, number> = { potion: 100, magnifier: 150 }
const GACHA_POOL = [
  { emoji: '🐵', weight: 40, rarity: 'Common' },
  { emoji: '🦊', weight: 30, rarity: 'Common' },
  { emoji: '🐼', weight: 15, rarity: 'Rare' },
  { emoji: '🦄', weight: 8, rarity: 'Epic' },
  { emoji: '🐉', weight: 5, rarity: 'Legendary' },
  { emoji: '👽', weight: 2, rarity: 'Mythic' },
] as const

const strings = (value: unknown) => Array.isArray(value) ? value.map(String) : []
const progress = (value: unknown): Inventory => value && typeof value === 'object'
  ? { ...(value as Inventory), play1: Number((value as Inventory).play1) || 0, correct5: Number((value as Inventory).correct5) || 0 }
  : { play1: 0, correct5: 0 }

export function resetDailyState(raw: Inventory, today: string): Inventory {
  if (raw.dailyDate === today) {
    return { ...raw, dailyDone: strings(raw.dailyDone), dailyAnswers: strings(raw.dailyAnswers), dailyProgress: progress(raw.dailyProgress) }
  }
  return { ...raw, dailyDate: today, dailyDone: [], dailyProgress: { play1: 0, correct5: 0 }, dailyAnswers: [] }
}

export function applyDailyProgress(raw: Inventory, today: string, questId: string, increment: number, answerId?: string) {
  const inventory = resetDailyState(raw, today)
  const done = strings(inventory.dailyDone)
  const answers = strings(inventory.dailyAnswers)
  const dailyProgress = progress(inventory.dailyProgress)
  if (done.includes(questId)) return { inventory, status: 'already_done', newProgress: Number(dailyProgress[questId]) || 0 }
  if (questId === 'correct5' && answerId && answers.includes(answerId)) {
    return { inventory, status: 'duplicate_answer', newProgress: Number(dailyProgress[questId]) || 0 }
  }
  if (questId === 'correct5' && answerId) answers.push(answerId)
  dailyProgress[questId] = (Number(dailyProgress[questId]) || 0) + (Number(increment) || 0)
  return { inventory: { ...inventory, dailyAnswers: answers, dailyProgress }, newProgress: dailyProgress[questId] }
}

const dateNumber = (date: string) => Date.parse(`${date}T00:00:00Z`)

export function applyLoginBonus(user: Inventory, today: string) {
  const coins = Number(user.coins) || 0
  const streak = Number(user.streak) || 0
  const inventory = resetDailyState((user.inventory as Inventory) || {}, today)
  if (user.lastLogin === today) return { isNew: false, streak, coins, inventory }
  const consecutive = typeof user.lastLogin === 'string' && dateNumber(today) - dateNumber(user.lastLogin) === 86_400_000
  const newStreak = consecutive ? streak + 1 : 1
  const dailyDone = strings(inventory.dailyDone)
  if (!dailyDone.includes('login')) dailyDone.push('login')
  const badges = strings(inventory.badges)
  if (newStreak >= 7 && !badges.includes('badge_streak_7')) badges.push('badge_streak_7')
  return {
    isNew: true,
    streak: newStreak,
    coinsGained: 20,
    totalCoins: coins + 20,
    inventory: { ...inventory, dailyDone, badges },
  }
}

export function completeQuest(user: Inventory, today: string, questId: string, rewardCoins: number, rewardXp: number) {
  const inventory = resetDailyState((user.inventory as Inventory) || {}, today)
  const dailyDone = strings(inventory.dailyDone)
  if (dailyDone.includes(questId)) return { success: false as const, error: 'รางวัลถูกรับไปแล้ว' }
  dailyDone.push(questId)
  return {
    success: true as const,
    coins: (Number(user.coins) || 0) + (Number(rewardCoins) || 0),
    xp: (Number(user.xp) || 0) + (Number(rewardXp) || 0),
    inventory: { ...inventory, dailyDone },
  }
}

export function buyInventoryItem(rawCoins: number, rawInventory: Inventory, itemId: string) {
  const cost = SERVER_PRICES[itemId]
  const coins = Number(rawCoins) || 0
  if (cost === undefined) return { success: false, error: 'ไอเทมนี้ไม่มีขายในระบบ' }
  if (coins < cost) return { success: false, error: 'เหรียญไม่พอจ้า' }
  return { success: true, coins: coins - cost, inventory: { ...rawInventory, [itemId]: (Number(rawInventory[itemId]) || 0) + 1 } }
}

export function consumeInventoryItem(rawInventory: Inventory, itemId: string) {
  const count = Number(rawInventory[itemId]) || 0
  if (count <= 0) return { success: false, error: 'ไอเทมไม่เพียงพอ' }
  return { success: true, inventory: { ...rawInventory, [itemId]: count - 1 } }
}

export function pickGachaAvatar(randomValue = Math.random()) {
  let cursor = Math.min(Math.max(randomValue, 0), 0.999999) * 100
  for (const item of GACHA_POOL) {
    if (cursor < item.weight) return { emoji: item.emoji, rarity: item.rarity }
    cursor -= item.weight
  }
  return GACHA_POOL[GACHA_POOL.length - 1]
}

export function worldBossResult(bossId: string, rawScore: number, previousBest?: number | null) {
  const cleanScore = Math.round((Number(rawScore) || 0) * 100) / 100
  const timeBased = bossId !== 'WB003' && (!bossId.startsWith('WB002') || bossId === 'WB002_SPEEDRUN')
  const noPrevious = previousBest === undefined || previousBest === null
  const isPersonalBest = noPrevious || (timeBased ? cleanScore < previousBest : cleanScore > previousBest)
  return { cleanScore, isPersonalBest, bestScore: isPersonalBest ? cleanScore : Number(previousBest) }
}
