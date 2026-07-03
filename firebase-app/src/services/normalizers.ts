export type UserRecord = Record<string, unknown>

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
  const inventory = value.inventory && typeof value.inventory === 'object'
    ? value.inventory
    : { potion: 0, magnifier: 0 }

  return {
    ...value,
    id,
    name: String(value.name || ''),
    class: String(value.class || ''),
    xp,
    level: Number(value.level) || Math.floor(xp / 100) + 1,
    rank: String(value.rank || rankForXp(xp)),
    avatar: String(value.avatar || '🧙‍♂️'),
    coins: Number(value.coins) || 0,
    streak: Number(value.streak) || 0,
    inventory,
    lastLogin: value.lastLogin || '',
  }
}
