import { useEffect, useState } from 'react'
import { TEACHER_NPC_NAME, describeQuestRewards, trackerHint, type StudentQuestView } from '../services/teacherQuestLogic'

type Props = {
  tracked: StudentQuestView | null
  /** Hub: fires directly on click (opens the NPC dialogue). Map/lesson: fires only from the
   *  expanded detail card's explicit "go to the NPC" button — clicking the chip itself just
   *  expands/collapses an in-place quest summary instead of leaving the screen. */
  onClick(): void
  variant?: 'hub' | 'map' | 'lesson'
  testId?: string
}

export function TeacherQuestTracker({ tracked, onClick, variant = 'hub', testId = 'npc-tracker' }: Props) {
  const [open, setOpen] = useState(false)

  // Collapse automatically if the tracked quest itself changes (accepted a
  // new one, turned the old one in) so a stale detail card never lingers.
  useEffect(() => { setOpen(false) }, [tracked?.questId])

  if (!tracked) return null

  if (variant === 'hub') {
    return (
      <button type="button" className="teacher-quest-tracker" data-testid={testId} onClick={onClick}>
        <TrackerHeader tracked={tracked} />
      </button>
    )
  }

  const rewardLines = describeQuestRewards(tracked.earnable)

  return (
    <div className={`teacher-quest-tracker${variant === 'lesson' ? ' on-lesson' : ''}${open ? ' expanded' : ''}`}>
      <button
        type="button"
        className="teacher-quest-tracker-toggle"
        data-testid={testId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <TrackerHeader tracked={tracked} />
        <i className="teacher-quest-tracker-chevron" aria-hidden="true">{open ? '▴' : '▾'}</i>
      </button>
      {open && (
        <div className="teacher-quest-tracker-detail" data-testid={`${testId}-detail`}>
          {rewardLines.length > 0 && (
            <ul>
              {rewardLines.map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}
          {tracked.rewards.bonusXp + tracked.rewards.bonusCoins > 0 && (
            <p>{tracked.earnable.earlyBonusApplied ? '🎯 ยังทันโบนัสส่งก่อนกำหนด' : '🎯 เลยกำหนดโบนัสแล้ว'}</p>
          )}
          <button type="button" className="teacher-quest-tracker-goto" onClick={onClick}>
            ไปหา{TEACHER_NPC_NAME} <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
    </div>
  )
}

function TrackerHeader({ tracked }: { tracked: StudentQuestView }) {
  return (
    <>
      <b><span aria-hidden="true">◆</span> {tracked.title}</b>
      {tracked.objectives.map((objective) => (
        <small key={objective.key} data-done={objective.done}>
          <i aria-hidden="true">{objective.done ? '✓' : '○'}</i> {objective.label} {objective.done ? '1/1' : '0/1'}
        </small>
      ))}
      <em>{trackerHint(tracked)}</em>
    </>
  )
}
