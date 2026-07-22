import { describe, expect, it } from 'vitest'
import {
  LESSON_MONSTER_KILL_TARGET,
  completedLessonQuests,
  createLessonAdventure,
  defeatLessonMonster,
  finishLessonVideo,
  hitLessonMonster,
  lessonQuestObjectives,
  readLessonNote,
  useLessonPortal,
} from './lessonAdventureLogic'

function killMonsters(progress: ReturnType<typeof createLessonAdventure>, count: number, roll = 0.99) {
  let next = progress
  for (let i = 0; i < count; i += 1) next = defeatLessonMonster(next, roll)
  return next
}

describe('lessonAdventureLogic', () => {
  it('drops the lesson note randomly with a three-kill pity guarantee', () => {
    const start = createLessonAdventure()
    const first = defeatLessonMonster(start, 0.99)
    const second = defeatLessonMonster(first, 0.99)
    const third = defeatLessonMonster(second, 0.99)

    expect(first.noteDropped).toBe(false)
    expect(second.noteDropped).toBe(false)
    expect(third).toMatchObject({ monstersDefeated: 3, noteDropped: true })
  })

  it('keeps counting zone kills toward the 20-kill quest even after the note is read', () => {
    const read = readLessonNote(killMonsters(createLessonAdventure(), 3))
    const next = defeatLessonMonster(read, 0.99)
    expect(next.monstersDefeated).toBe(4)
  })

  it('does not unlock the next portal until both the kill quest and the zone quest are done', () => {
    const noteReadOnly = readLessonNote(killMonsters(createLessonAdventure(), 3))
    expect(useLessonPortal(noteReadOnly).zone).toBe(1)

    const killsOnlyNoNote = killMonsters(createLessonAdventure(), LESSON_MONSTER_KILL_TARGET)
    expect(useLessonPortal(killsOnlyNoNote).zone).toBe(1)

    const bothDone = readLessonNote(killMonsters(createLessonAdventure(), LESSON_MONSTER_KILL_TARGET))
    const afterPortal = useLessonPortal(bothDone)
    expect(afterPortal.zone).toBe(2)
    expect(afterPortal.monstersDefeated).toBe(0)
  })

  it('requires 20 zone-2 kills plus the video watch before unlocking the boss room', () => {
    const zone2Start = useLessonPortal(readLessonNote(killMonsters(createLessonAdventure(), LESSON_MONSTER_KILL_TARGET)))
    const videoOnly = finishLessonVideo(zone2Start)
    expect(useLessonPortal(videoOnly).zone).toBe(2)

    const killsAndVideo = finishLessonVideo(killMonsters(zone2Start, LESSON_MONSTER_KILL_TARGET))
    expect(useLessonPortal(killsAndVideo).zone).toBe(3)
  })

  it('stops counting kills once the player reaches the boss zone', () => {
    const zone3 = { ...createLessonAdventure(), zone: 3 as const }
    expect(defeatLessonMonster(zone3, 0).monstersDefeated).toBe(0)
  })

  it('does not complete note or video quests in the wrong state', () => {
    expect(readLessonNote(createLessonAdventure()).noteRead).toBe(false)
    expect(finishLessonVideo(createLessonAdventure()).videoWatched).toBe(false)
  })

  it('requires repeated attacks before a lesson monster is defeated', () => {
    expect(hitLessonMonster(100, 45)).toEqual({ hp: 55, defeated: false })
    expect(hitLessonMonster(55, 45)).toEqual({ hp: 10, defeated: false })
    expect(hitLessonMonster(10, 45)).toEqual({ hp: 0, defeated: true })
  })

  describe('lessonQuestObjectives', () => {
    it('lists a monster-kill objective and a note objective for zone 1', () => {
      const progress = killMonsters(createLessonAdventure(), 4)
      const objectives = lessonQuestObjectives(progress)
      expect(objectives).toEqual([
        { id: 'zone1-kills', label: 'โจมตีมอนสเตอร์', current: 4, target: 20, done: false },
        { id: 'zone1-note', label: 'โน้ตความรู้', current: 0, target: 1, done: false },
      ])
    })

    it('caps the displayed kill count at the target and marks objectives done', () => {
      const progress = readLessonNote(killMonsters(createLessonAdventure(), 25))
      const objectives = lessonQuestObjectives(progress)
      expect(objectives[0]).toEqual({ id: 'zone1-kills', label: 'โจมตีมอนสเตอร์', current: 20, target: 20, done: true })
      expect(objectives[1]).toEqual({ id: 'zone1-note', label: 'โน้ตความรู้', current: 1, target: 1, done: true })
    })

    it('lists a monster-kill objective and a video objective for zone 2', () => {
      const zone2 = useLessonPortal(readLessonNote(killMonsters(createLessonAdventure(), LESSON_MONSTER_KILL_TARGET)))
      const objectives = lessonQuestObjectives(zone2)
      expect(objectives).toEqual([
        { id: 'zone2-kills', label: 'ปราบผู้พิทักษ์หอจดหมายเหตุ', current: 0, target: 20, done: false },
        { id: 'zone2-video', label: 'ตู้วิดีโอลับ', current: 0, target: 1, done: false },
      ])
    })

    it('has no checklist objectives for the boss zone', () => {
      expect(lessonQuestObjectives({ ...createLessonAdventure(), zone: 3 })).toEqual([])
    })
  })

  // Lessons the admin never gave a video link to must not demand the video
  // quest — the cabinet would only open an empty player.
  describe('lessons without a video', () => {
    // Inlined rather than extracted into a helper: a lowercase helper calling
    // useLessonPortal trips the react-hooks lint rule on the "use" prefix.
    const zone1Cleared = (hasVideo: boolean) =>
      readLessonNote(killMonsters(createLessonAdventure(hasVideo), LESSON_MONSTER_KILL_TARGET))

    it('carries the hasVideo flag from creation and keeps it across the zone 1 to 2 reset', () => {
      expect(createLessonAdventure(false).hasVideo).toBe(false)
      expect(useLessonPortal(zone1Cleared(false)).hasVideo).toBe(false)
      expect(useLessonPortal(zone1Cleared(true)).hasVideo).toBe(true)
    })

    it('defaults to having a video so an unspecified lesson never skips a real one', () => {
      expect(createLessonAdventure().hasVideo).toBe(true)
    })

    it('lists only the kill objective in zone 2', () => {
      expect(lessonQuestObjectives(useLessonPortal(zone1Cleared(false)))).toEqual([
        { id: 'zone2-kills', label: 'ปราบผู้พิทักษ์หอจดหมายเหตุ', current: 0, target: 20, done: false },
      ])
    })

    it('unlocks the boss room on kills alone', () => {
      const killsOnly = killMonsters(useLessonPortal(zone1Cleared(false)), LESSON_MONSTER_KILL_TARGET)
      expect(useLessonPortal(killsOnly).zone).toBe(3)
    })

    it('still holds the portal shut while the kill quest is unfinished', () => {
      expect(useLessonPortal(killMonsters(useLessonPortal(zone1Cleared(false)), 5)).zone).toBe(2)
    })

    it('counts the video out of the completed-quest tally', () => {
      const cleared = killMonsters(useLessonPortal(zone1Cleared(false)), LESSON_MONSTER_KILL_TARGET)
      // Zone 1's note is the only completable side quest in a video-less lesson.
      expect(completedLessonQuests(cleared)).toBe(0)
      expect(completedLessonQuests(finishLessonVideo(useLessonPortal(zone1Cleared(true))))).toBe(1)
    })

    it('leaves zone 1 completely unchanged', () => {
      const zone1 = killMonsters(createLessonAdventure(false), 4)
      expect(lessonQuestObjectives(zone1)).toEqual([
        { id: 'zone1-kills', label: 'โจมตีมอนสเตอร์', current: 4, target: 20, done: false },
        { id: 'zone1-note', label: 'โน้ตความรู้', current: 0, target: 1, done: false },
      ])
      expect(useLessonPortal(zone1).zone).toBe(1)
    })
  })
})
