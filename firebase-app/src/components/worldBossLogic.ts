export type WorldBossConfig = {
  id: string
  name: string
  poseType: string
  targetReps: number
  maxHp: number
  rewardCoins: number
  rewardXp: number
}

export type WorldBossResultMessage = {
  type: 'nextgen:world-boss-result'
  session: string
  payload: { bossId: string; score: number; bonusCoins: number }
}

const neckQuiz: WorldBossConfig = {
  id: 'WB003',
  name: 'วิทยาการคำนวณ ม.2 (Neck-Tilt Quiz AI)',
  poseType: 'neck_quiz',
  targetReps: 10,
  maxHp: 100,
  rewardCoins: 150,
  rewardXp: 150,
}

const isWb002 = (boss: Pick<WorldBossConfig, 'id' | 'poseType'>) => boss.id.startsWith('WB002') || ['speed_runner', 'jumping_jack'].includes(boss.poseType)

export function normalizeWorldBosses(rawBosses: WorldBossConfig[]) {
  const source = rawBosses.map((boss) => ({ ...boss }))
  if (!source.some((boss) => boss.id === 'WB003' || boss.poseType === 'neck_quiz')) source.push({ ...neckQuiz })
  const result: WorldBossConfig[] = []
  let speedRunner: WorldBossConfig | undefined
  source.forEach((boss) => {
    if (!isWb002(boss)) {
      result.push(boss)
      return
    }
    if (!speedRunner) {
      speedRunner = {
        ...boss,
        id: 'WB002',
        name: 'สมรภูมิยอดนักวิ่งลมกรด (Speed Runner)',
        poseType: 'speed_runner',
        targetReps: 15,
      }
      result.push(speedRunner)
      return
    }
    speedRunner.rewardCoins = Math.max(speedRunner.rewardCoins, boss.rewardCoins)
    speedRunner.rewardXp = Math.max(speedRunner.rewardXp, boss.rewardXp)
  })
  return result
}

export function gameFileForBoss(boss: Pick<WorldBossConfig, 'id' | 'poseType'>) {
  return boss.id === 'WB003' || boss.poseType === 'neck_quiz' ? 'neck_quiz.html' : 'fitness.html'
}

export function scorePresentation(bossId: string, rawScore: number) {
  const score = Number(rawScore) || 0
  const countBased = bossId === 'WB003' || (bossId.startsWith('WB002') && bossId !== 'WB002_SPEEDRUN')
  return countBased
    ? { value: String(Math.round(score)), unit: 'ข้อ' }
    : { value: score.toFixed(2), unit: 'วินาที' }
}

export function validWorldBossResult(raw: unknown, expectedSession: string): WorldBossResultMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const message = raw as Partial<WorldBossResultMessage>
  const payload = message.payload
  if (message.type !== 'nextgen:world-boss-result' || message.session !== expectedSession || !payload) return null
  if (!payload.bossId || !Number.isFinite(payload.score) || payload.score < 0 || !Number.isFinite(payload.bonusCoins) || payload.bonusCoins < 0) return null
  return message as WorldBossResultMessage
}
