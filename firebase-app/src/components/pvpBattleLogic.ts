export type PvpRole = 'Player1' | 'Player2'

export function applyPvpAnswer(hp: number, correct: boolean) {
  return correct ? hp : Math.max(0, hp - 20)
}

export function isPvpWinner(role: PvpRole, match: { p1Hp: number; p2Hp: number }) {
  const mine = role === 'Player1' ? match.p1Hp : match.p2Hp
  const opponent = role === 'Player1' ? match.p2Hp : match.p1Hp
  return mine >= opponent
}

export function validPrivatePin(pin: string) {
  return /^\d{4}$/.test(pin.trim())
}
