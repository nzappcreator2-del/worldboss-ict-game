export type PvpRole = 'Player1' | 'Player2'

export function applyPvpAnswer(hp: number, correct: boolean) {
  return correct ? hp : Math.max(0, hp - 20)
}

export type PvpOutcome = 'win' | 'lose' | 'draw'

export function pvpOutcome(role: PvpRole, match: { p1Hp: number; p2Hp: number }): PvpOutcome {
  const mine = role === 'Player1' ? match.p1Hp : match.p2Hp
  const opponent = role === 'Player1' ? match.p2Hp : match.p1Hp
  if (mine === opponent) return 'draw'
  return mine > opponent ? 'win' : 'lose'
}

// How long the finished player waits for the opponent before treating the
// match as abandoned. Slowest legitimate finish: 5 questions x 15s + latency.
export const PVP_OPPONENT_TIMEOUT_MS = 120_000

export function validPrivatePin(pin: string) {
  return /^\d{4}$/.test(pin.trim())
}
