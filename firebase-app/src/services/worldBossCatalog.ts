// Fixed catalog of the "มินิเกม (AI Camera)" stages. The old World Boss
// feature (admin-configurable worldBossConfig collection) was retired: the
// mini-games are a built-in playset, so their definitions live in code and
// there is nothing to configure in the admin panel or in Firestore.
// worldBossScores (leaderboards / personal bests) still lives in Firestore.
// Snapshot source: worldBossConfig collection as of 2026-07-19, before the
// collection was deleted.

export type WorldBossEntry = {
  id: string
  name: string
  poseType: string
  targetReps: number
  maxHp: number
  rewardCoins: number
  rewardXp: number
}

export const WORLD_BOSS_CATALOG: WorldBossEntry[] = [
  { id: 'WB001', name: 'ไททันจอมพลัง (Giga Squat)', poseType: 'squat', targetReps: 10, maxHp: 100, rewardCoins: 100, rewardXp: 100 },
  { id: 'WB002', name: 'พายุทอร์นาโด (Jumping Jack)', poseType: 'jumping_jack', targetReps: 15, maxHp: 150, rewardCoins: 150, rewardXp: 150 },
  { id: 'WB002_1', name: 'สมรภูมิยอดนักวิ่งลมกรด (ทดสอบ 1 วินาที)', poseType: 'speed_runner', targetReps: 1, maxHp: 10, rewardCoins: 5, rewardXp: 5 },
  { id: 'WB002_10', name: 'สมรภูมิยอดนักวิ่งลมกรด (10 วินาที)', poseType: 'speed_runner', targetReps: 10, maxHp: 100, rewardCoins: 80, rewardXp: 80 },
  { id: 'WB002_15', name: 'สมรภูมิยอดนักวิ่งลมกรด (15 วินาที)', poseType: 'speed_runner', targetReps: 15, maxHp: 150, rewardCoins: 100, rewardXp: 100 },
  { id: 'WB002_20', name: 'สมรภูมิยอดนักวิ่งลมกรด (20 วินาที)', poseType: 'speed_runner', targetReps: 20, maxHp: 200, rewardCoins: 150, rewardXp: 150 },
  { id: 'WB002_30', name: 'สมรภูมิยอดนักวิ่งลมกรด (30 วินาที)', poseType: 'speed_runner', targetReps: 30, maxHp: 300, rewardCoins: 200, rewardXp: 200 },
  { id: 'WB002_SPEEDRUN', name: 'สมรภูมิมือปราบภัย AI (Speedrun เคลียร์ 12 ข้อ)', poseType: 'speed_runner', targetReps: 12, maxHp: 120, rewardCoins: 250, rewardXp: 250 },
]

// Submits scores as WB003 (neck-exercise quiz) without appearing as a lobby
// card — same special case the old Firestore path handled.
const HIDDEN_ENTRIES: WorldBossEntry[] = [
  { id: 'WB003', name: 'วิทยาการคำนวณ ม.2', poseType: 'neck_quiz', targetReps: 12, maxHp: 100, rewardCoins: 150, rewardXp: 150 },
]

export function findWorldBoss(bossId: string): WorldBossEntry | null {
  if (!bossId) return null
  return WORLD_BOSS_CATALOG.find((boss) => boss.id === bossId)
    ?? HIDDEN_ENTRIES.find((boss) => boss.id === bossId)
    ?? null
}
