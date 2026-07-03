export type BattleState = { bossHp: number; playerHp: number; score: number; combo: number }
export type MatchingPair = { left: string; right: string }

export function applyBattleAnswer(state: BattleState, correct: boolean, questionCount: number): BattleState {
  if (correct) {
    return {
      ...state,
      bossHp: state.bossHp - (100 / Math.max(1, questionCount)),
      score: state.score + 1,
      combo: state.combo + 0.2,
    }
  }
  return {
    ...state,
    playerHp: state.playerHp - (100 / (questionCount > 3 ? 3 : 2)),
    combo: 1,
  }
}

export function battleOutcome(intendedWin: boolean, score: number, total: number) {
  const percent = total > 0 ? (score / total) * 100 : 0
  return { passed: intendedWin && percent >= 60, percent }
}

export function starsForScore(score: number, total: number) {
  const percent = total > 0 ? (score / total) * 100 : 0
  return percent >= 80 ? 3 : percent >= 60 ? 2 : 1
}

export function healPlayer(hp: number) {
  return Math.min(100, hp + 30)
}

export function matchingAnswerIsCorrect(pairs: MatchingPair[], matches: Record<string, string>) {
  return pairs.length > 0 && pairs.every((pair) => matches[pair.left] === pair.right)
}
