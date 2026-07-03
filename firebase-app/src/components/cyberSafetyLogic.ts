export type CyberRun = { shield: number; coins: number; xp: number; attempts: number }

export function cyberReward(attempts: number) {
  return attempts > 0 ? { coins: 5, xp: 5 } : { coins: 20, xp: 20 }
}

export function applyCyberChoice(run: CyberRun, correct: boolean): CyberRun {
  if (!correct) return { ...run, shield: Math.max(0, run.shield - 25), attempts: run.attempts + 1 }
  const reward = cyberReward(run.attempts)
  return { ...run, coins: run.coins + reward.coins, xp: run.xp + reward.xp }
}
