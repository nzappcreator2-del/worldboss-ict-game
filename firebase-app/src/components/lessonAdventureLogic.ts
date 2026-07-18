export type LessonZone = 1 | 2 | 3

export type LessonAdventureProgress = {
  zone: LessonZone
  monstersDefeated: number
  noteDropped: boolean
  noteRead: boolean
  videoWatched: boolean
}

export const LESSON_MONSTER_KILL_TARGET = 20

export function createLessonAdventure(): LessonAdventureProgress {
  return { zone: 1, monstersDefeated: 0, noteDropped: false, noteRead: false, videoWatched: false }
}

export function defeatLessonMonster(progress: LessonAdventureProgress, roll: number): LessonAdventureProgress {
  if (progress.zone === 3) return progress
  const monstersDefeated = progress.monstersDefeated + 1
  if (progress.zone !== 1) return { ...progress, monstersDefeated }
  return {
    ...progress,
    monstersDefeated,
    noteDropped: progress.noteDropped || roll < 0.42 || monstersDefeated >= 3,
  }
}

export function readLessonNote(progress: LessonAdventureProgress): LessonAdventureProgress {
  if (progress.zone !== 1 || !progress.noteDropped) return progress
  return { ...progress, noteRead: true }
}

export function finishLessonVideo(progress: LessonAdventureProgress): LessonAdventureProgress {
  if (progress.zone !== 2) return progress
  return { ...progress, videoWatched: true }
}

export function lessonKillQuestDone(progress: LessonAdventureProgress): boolean {
  return progress.monstersDefeated >= LESSON_MONSTER_KILL_TARGET
}

export function useLessonPortal(progress: LessonAdventureProgress): LessonAdventureProgress {
  if (progress.zone === 1 && progress.noteRead && lessonKillQuestDone(progress)) {
    return { zone: 2, monstersDefeated: 0, noteDropped: false, noteRead: false, videoWatched: false }
  }
  if (progress.zone === 2 && progress.videoWatched && lessonKillQuestDone(progress)) {
    return { ...progress, zone: 3 }
  }
  return progress
}

export function completedLessonQuests(progress: LessonAdventureProgress) {
  return Number(progress.noteRead) + Number(progress.videoWatched)
}

export type LessonQuestObjective = {
  id: string
  label: string
  current: number
  target: number
  done: boolean
}

export function lessonQuestObjectives(progress: LessonAdventureProgress): LessonQuestObjective[] {
  const killObjective = (id: string, label: string): LessonQuestObjective => ({
    id,
    label,
    current: Math.min(progress.monstersDefeated, LESSON_MONSTER_KILL_TARGET),
    target: LESSON_MONSTER_KILL_TARGET,
    done: lessonKillQuestDone(progress),
  })
  if (progress.zone === 1) {
    return [
      killObjective('zone1-kills', 'โจมตีมอนสเตอร์'),
      { id: 'zone1-note', label: 'โน้ตความรู้', current: progress.noteRead ? 1 : 0, target: 1, done: progress.noteRead },
    ]
  }
  if (progress.zone === 2) {
    return [
      killObjective('zone2-kills', 'ปราบผู้พิทักษ์หอจดหมายเหตุ'),
      { id: 'zone2-video', label: 'ตู้วิดีโอลับ', current: progress.videoWatched ? 1 : 0, target: 1, done: progress.videoWatched },
    ]
  }
  return []
}

export function hitLessonMonster(hp: number, damage = 45) {
  const nextHp = Math.max(0, hp - Math.max(0, damage))
  return { hp: nextHp, defeated: nextHp === 0 }
}
