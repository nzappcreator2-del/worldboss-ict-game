export type BattleState = { bossHp: number; playerHp: number; score: number; combo: number }
export type MatchingPair = { left: string; right: string }

export const bossDamagePerCorrect = (questionCount: number) => 100 / Math.max(1, questionCount)
export const playerDamagePerWrong = (questionCount: number) => 100 / (questionCount > 3 ? 3 : 2)
export const skirmishBossDamagePerTick = 1
export const skirmishPlayerDamagePerTick = 2

function safeRandomValue(random: () => number) {
  return Math.min(1, Math.max(0, Number(random()) || 0))
}

export function bossSkillDelayMs(random: () => number = Math.random) {
  return 2200 + Math.round(safeRandomValue(random) * 1800)
}

export function selectBossSkillQuestionIndex(remainingQuestionIndexes: readonly number[], random: () => number = Math.random) {
  if (remainingQuestionIndexes.length === 0) return -1
  const index = Math.min(remainingQuestionIndexes.length - 1, Math.floor(safeRandomValue(random) * remainingQuestionIndexes.length))
  return remainingQuestionIndexes[index]
}

export function applySkirmishExchange(state: BattleState, questionCount: number, remainingQuestionCount: number): BattleState {
  const protectedBossHp = remainingQuestionCount > 0
    ? ((Math.max(1, remainingQuestionCount) - 1) * bossDamagePerCorrect(questionCount)) + 1
    : 0
  const protectedPlayerHp = remainingQuestionCount > 0 ? 1 : 0
  return {
    ...state,
    bossHp: Math.max(protectedBossHp, state.bossHp - skirmishBossDamagePerTick),
    playerHp: Math.max(protectedPlayerHp, state.playerHp - skirmishPlayerDamagePerTick),
  }
}

export function applyBattleAnswer(state: BattleState, correct: boolean, questionCount: number): BattleState {
  if (correct) {
    return {
      ...state,
      bossHp: state.bossHp - bossDamagePerCorrect(questionCount),
      score: state.score + 1,
      combo: state.combo + 0.2,
    }
  }
  return {
    ...state,
    playerHp: state.playerHp - playerDamagePerWrong(questionCount),
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
