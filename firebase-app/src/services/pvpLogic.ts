export type ReadyState = boolean | 'FINISHED'
export type MatchState = {
  matchId: string
  p1Id: string
  p2Id?: string | null
  p1Name: string
  p2Name?: string
  p1Avatar: string
  p2Avatar?: string
  p1Hp: number
  p2Hp: number
  p1Ready: ReadyState
  p2Ready: ReadyState
  status: string
  [key: string]: unknown
}

export function canJoinWaitingMatch(match: MatchState, userId: string): boolean {
  return match.status === 'WAITING' && !match.p2Id && match.p1Id !== userId
}

export function canReusePrivateRoom(match: MatchState): boolean {
  return match.status === 'FINISHED' || match.status === 'CANCELLED'
}

export function matchResponse(match: MatchState) {
  return {
    success: true,
    matchId: match.matchId,
    p1Id: match.p1Id,
    p2Id: match.p2Id || null,
    p1Name: match.p1Name,
    p2Name: match.p2Name || '',
    p1Avatar: match.p1Avatar,
    p2Avatar: match.p2Avatar || '',
    p1Hp: Number(match.p1Hp) || 0,
    p2Hp: Number(match.p2Hp) || 0,
    p1Ready: match.p1Ready === true || match.p1Ready === 'FINISHED',
    p2Ready: match.p2Ready === true || match.p2Ready === 'FINISHED',
    status: match.status,
  }
}

export function setReady(match: MatchState, userId: string, ready: boolean): MatchState {
  const next = { ...match }
  if (match.p1Id === userId) next.p1Ready = ready
  else if (match.p2Id === userId) next.p2Ready = ready
  else throw new Error('Player is not part of this match')
  if (next.p1Ready === true && next.p2Ready === true) next.status = 'PLAYING'
  return next
}

export function updateHp(match: MatchState, userId: string, rawHp: number): MatchState & { isGameOver: boolean; winner: string | null } {
  const next = { ...match }
  const hp = Math.max(0, Math.min(100, Number(rawHp) || 0))
  let winner: string | null = null
  if (match.p1Id === userId) {
    next.p1Hp = hp
    if (hp <= 0) winner = 'Player2'
  } else if (match.p2Id === userId) {
    next.p2Hp = hp
    if (hp <= 0) winner = 'Player1'
  } else throw new Error('Player is not part of this match')
  if (winner) next.status = 'FINISHED'
  return { ...next, isGameOver: Boolean(winner), winner }
}

export function finishPlayer(match: MatchState, userId: string): MatchState {
  const next = { ...match }
  if (match.p1Id === userId) next.p1Ready = 'FINISHED'
  else if (match.p2Id === userId) next.p2Ready = 'FINISHED'
  else throw new Error('Player is not part of this match')
  if (next.p1Ready === 'FINISHED' && next.p2Ready === 'FINISHED') next.status = 'FINISHED'
  return next
}
