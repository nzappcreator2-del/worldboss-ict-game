import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  NPC_SMALL_TALK,
  STUDENT_STATUS_LABELS,
  TEACHER_NPC_NAME,
  TEACHER_NPC_ROLE,
  describeQuestRewards,
  dialogueForQuest,
  newQuestIdsToNotify,
  npcMarkerForStatuses,
  trackedQuest,
  trackerHint,
  type DialogueAction,
  type EarnedQuestRewards,
  type StudentQuestView,
} from '../services/teacherQuestLogic'
import { playSound } from '../services/soundFx'
import {
  BLINK_GAP_MS,
  BLINK_HOLD_MS,
  CELEBRATE_OVERLAY_FRAME,
  IDLE_BASE_FRAME,
  IDLE_BLINK_FRAME,
  isDoubleBlink,
  nextBlinkDelay,
  npcPortraitStyle,
  npcSpriteStyle,
} from './teacherNpcSprite'

export type TeacherQuestStats = { xp: number; coins: number; level: number; rank: string; inventory?: unknown }

export type TeacherNpcService = {
  getCurrentUser(): { id: string; level?: number } | null
  loadQuestBoard(userId: string): Promise<{ success: boolean; data?: StudentQuestView[]; error?: string }>
  acceptQuest(userId: string, questId: string): Promise<{ success: boolean; error?: string }>
  markStudied(userId: string, questId: string): Promise<{ success: boolean; error?: string }>
  turnInQuest(userId: string, questId: string): Promise<{
    success: boolean
    alreadyTurnedIn?: boolean
    error?: string
    earned?: EarnedQuestRewards
    stats?: TeacherQuestStats
  }>
}

type Props = {
  service: TeacherNpcService
  /** Opens the adventure map so the student walks into the lesson themselves. */
  onOpenMap(lessonId: string): void
  /** Pushes the paid reward into the shared user object so the HUD updates live. */
  onUserUpdate(stats: TeacherQuestStats): void
}

// Guild-hall home scene: ครูวีรภัทร์ stands centered on the red carpet in
// front of the painted crystal altar. The altar sits near the horizontal
// middle of dashboard-guild-hall.png, so plain section percentages track the
// painting closely at every cover-crop aspect (same approach as the painted
// portal hotspot and minimap blips).
const NPC_HUB_POSITION = { x: 51.8, y: 47 }
const NPC_TALK_DISTANCE = 16
// Throttled walk-position broadcast from the hub's walkable character.
export const HUB_PLAYER_POSITION_EVENT = 'nextgen:hub-player-position'
const SEEN_QUESTS_KEY = 'nextgen-npc-seen-quests'

const MARKER_SYMBOLS = { ready: '?', new: '!', working: '…' } as const

const readSeenQuestIds = (): string[] => {
  try {
    const raw = sessionStorage.getItem(SEEN_QUESTS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

const writeSeenQuestIds = (ids: string[]) => {
  try {
    sessionStorage.setItem(SEEN_QUESTS_KEY, JSON.stringify(ids))
  } catch {
    // Private-mode storage failures only cost the once-per-session throttle.
  }
}

const STATUS_PRIORITY: Record<StudentQuestView['studentStatus'], number> = {
  READY_TO_TURN_IN: 0,
  AVAILABLE: 1,
  OVERDUE: 2,
  IN_PROGRESS: 3,
  COMPLETED: 4,
}

export function TeacherNpc({ service, onOpenMap, onUserUpdate }: Props) {
  const [views, setViews] = useState<StudentQuestView[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [dialogueOpen, setDialogueOpen] = useState(false)
  const [selectedQuestId, setSelectedQuestId] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  // The celebration always renders what the server said it paid (`earned`),
  // never the client-side preview, so a stale board can't promise a reward the
  // payout did not actually grant.
  const [celebration, setCelebration] = useState<{
    view: StudentQuestView
    earned?: EarnedQuestRewards
    leveledUpTo?: number | null
  } | null>(null)
  const [toastVisible, setToastVisible] = useState(false)
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [frame, setFrame] = useState(IDLE_BASE_FRAME)
  const [speech, setSpeech] = useState('')
  const [near, setNear] = useState(false)
  const [rewardPops, setRewardPops] = useState<{ id: number; text: string; index: number }[]>([])
  const loadedOnce = useRef(false)
  const inFlight = useRef(false)
  const refreshTimer = useRef<number | null>(null)
  const rewardPopId = useRef(0)
  const popTimers = useRef<Set<number>>(new Set())

  // Unmounting mid-animation must not leave timers writing to dead state.
  useEffect(() => () => {
    popTimers.current.forEach((timer) => window.clearTimeout(timer))
    popTimers.current.clear()
  }, [])

  const load = useCallback(async (notify: boolean) => {
    const user = service.getCurrentUser()
    if (!user || inFlight.current) return
    inFlight.current = true
    setStatus((current) => (current === 'ready' ? current : 'loading'))
    try {
      const result = await service.loadQuestBoard(user.id)
      if (!result.success) throw new Error(result.error || 'load failed')
      const data = result.data || []
      setViews(data)
      setStatus('ready')
      loadedOnce.current = true
      if (notify) {
        const fresh = newQuestIdsToNotify(data, readSeenQuestIds())
        if (fresh.length > 0) {
          writeSeenQuestIds([...readSeenQuestIds(), ...fresh])
          setToastVisible(true)
        }
      }
    } catch {
      setStatus('error')
    } finally {
      inFlight.current = false
    }
  }, [service])

  // The NPC lives on the guild-hall home scene: load right away on mount
  // (the shell remounts this component whenever the scene returns to home),
  // again after login completes, and whenever the hub home reopens.
  useEffect(() => {
    void load(true)
    const reload = () => void load(true)
    // Silent refresh after rewards/worksheet submissions elsewhere in the game
    // so the marker flips to "พร้อมส่ง" without a page reload. Debounced —
    // nextgen:user-updated fires on every coin tick.
    const userUpdated = () => {
      if (!loadedOnce.current) return
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
      refreshTimer.current = window.setTimeout(() => void load(false), 1200)
    }
    window.addEventListener('nextgen:open-home', reload)
    window.addEventListener('nextgen:login-complete', reload)
    window.addEventListener('nextgen:user-updated', userUpdated)
    return () => {
      window.removeEventListener('nextgen:open-home', reload)
      window.removeEventListener('nextgen:login-complete', reload)
      window.removeEventListener('nextgen:user-updated', userUpdated)
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
    }
  }, [load])

  // Walk-up interaction: the hub's walkable character broadcasts its position
  // (throttled CustomEvent); flipping `near` only at the boundary keeps this
  // effectively free even while the player is running around.
  useEffect(() => {
    const onPlayerPosition = (event: Event) => {
      const detail = (event as CustomEvent<{ x?: number; y?: number }>).detail
      if (typeof detail?.x !== 'number' || typeof detail?.y !== 'number') return
      const close = Math.hypot(detail.x - NPC_HUB_POSITION.x, detail.y - NPC_HUB_POSITION.y) <= NPC_TALK_DISTANCE
      setNear((current) => (current === close ? current : close))
    }
    window.addEventListener(HUB_PLAYER_POSITION_EVENT, onPlayerPosition)
    return () => window.removeEventListener(HUB_PLAYER_POSITION_EVENT, onPlayerPosition)
  }, [])

  // Occasional idle chatter keeps the NPC alive without spamming the player.
  useEffect(() => {
    if (status !== 'ready') return
    const talk = window.setInterval(() => {
      setSpeech(NPC_SMALL_TALK[Math.floor(Math.random() * NPC_SMALL_TALK.length)])
      window.setTimeout(() => setSpeech(''), 4200)
    }, 19000)
    return () => window.clearInterval(talk)
  }, [status])

  useEffect(() => {
    if (!toastVisible) return
    const timer = window.setTimeout(() => setToastVisible(false), 6500)
    return () => window.clearTimeout(timer)
  }, [toastVisible])

  const orderedViews = useMemo(
    () => [...views].sort((a, b) => STATUS_PRIORITY[a.studentStatus] - STATUS_PRIORITY[b.studentStatus]),
    [views],
  )
  const selected = orderedViews.find((view) => view.questId === selectedQuestId) || orderedViews[0] || null
  const marker = npcMarkerForStatuses(views.map((view) => view.studentStatus))
  const tracked = trackedQuest(views)

  const openDialogue = useCallback(() => {
    setActionError('')
    setDetailOpen(false)
    setDialogueOpen(true)
  }, [])

  const closeDialogue = () => {
    setDialogueOpen(false)
    setDetailOpen(false)
    setActionError('')
  }

  useEffect(() => {
    if (!dialogueOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDialogue()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialogueOpen])

  // Walking close enough lets the player press E/Enter to talk, like an MMO.
  useEffect(() => {
    if (!near || dialogueOpen || status !== 'ready') return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof Element && target.matches('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'e' || event.key === 'E' || event.key === 'Enter') openDialogue()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [near, dialogueOpen, status, openDialogue])

  const runAction = async (action: DialogueAction, view: StudentQuestView) => {
    const user = service.getCurrentUser()
    if (!user) return
    setActionError('')
    if (action === 'close') return closeDialogue()
    if (action === 'detail') return setDetailOpen(true)
    if (action === 'continue' || action === 'review') {
      // Land on the adventure map, not inside the lesson: the student walks
      // into the gate themselves. The "studied" stamp therefore belongs to the
      // lesson actually opening, not to this button.
      closeDialogue()
      onOpenMap(view.lessonId)
      return
    }
    if (action === 'accept') {
      setBusy(true)
      try {
        const result = await service.acceptQuest(user.id, view.questId)
        if (!result.success) throw new Error(result.error || 'accept failed')
        playSound('questAccept')
        await load(false)
      } catch (error) {
        setActionError(error instanceof Error && error.message !== 'accept failed' ? error.message : 'รับภารกิจไม่สำเร็จ กรุณาลองใหม่')
      } finally {
        setBusy(false)
      }
      return
    }
    if (action === 'turnIn') {
      setBusy(true)
      // Captured before the payout so a level-up can be detected against it.
      const levelBefore = Number(user.level) || 0
      try {
        const result = await service.turnInQuest(user.id, view.questId)
        if (!result.success) {
          setActionError(result.error || 'ส่งงานไม่สำเร็จ กรุณาลองใหม่')
          return
        }
        // Push the paid totals into the shared user object. Dispatching an
        // event alone is not enough — every HUD listener re-reads that object,
        // so without this the student sees stale XP/coins until they refresh.
        if (!result.alreadyTurnedIn && result.stats) onUserUpdate(result.stats)
        await load(false)
        closeDialogue()
        if (!result.alreadyTurnedIn) {
          const leveledUpTo = result.stats && result.stats.level > levelBefore && levelBefore > 0
            ? result.stats.level
            : null
          setCelebration({ view, earned: result.earned, leveledUpTo })
          spawnRewardPops(result.earned)
          playSound(leveledUpTo ? 'levelUp' : 'questTurnIn')
        }
      } catch {
        setActionError('ส่งงานไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่')
      } finally {
        setBusy(false)
      }
    }
  }

  const closeCelebration = () => setCelebration(null)

  // Loot-style numbers rising over the HUD, so the payout is felt and not just
  // read. Purely decorative: the celebration panel remains the source of truth.
  const spawnRewardPops = (earned?: EarnedQuestRewards) => {
    if (!earned) return
    const lines = [
      ...(earned.xp > 0 ? [`+${earned.xp} XP`] : []),
      ...(earned.coins > 0 ? [`+${earned.coins} 🪙`] : []),
    ]
    if (lines.length === 0) return
    const spawned = lines.map((text, index) => ({ id: rewardPopId.current++, text, index }))
    setRewardPops((current) => [...current, ...spawned])
    const timer = window.setTimeout(() => {
      const ids = new Set(spawned.map((pop) => pop.id))
      setRewardPops((current) => current.filter((pop) => !ids.has(pop.id)))
      popTimers.current.delete(timer)
    }, 1600)
    popTimers.current.add(timer)
  }

  const reducedMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Calm, natural presence: the teacher holds the neutral stand and only
  // blinks — a few seconds apart on a randomized human cadence, held ~140ms,
  // occasionally twice in a row. One self-rescheduling timeout chain, fully
  // stilled under prefers-reduced-motion.
  useEffect(() => {
    setFrame(IDLE_BASE_FRAME)
    if (reducedMotion) return
    let disposed = false
    let timer = 0
    const after = (delay: number, run: () => void) => {
      timer = window.setTimeout(() => { if (!disposed) run() }, delay)
    }
    const closeEyes = (reopen: () => void) => {
      setFrame(IDLE_BLINK_FRAME)
      after(BLINK_HOLD_MS, () => {
        setFrame(IDLE_BASE_FRAME)
        reopen()
      })
    }
    const scheduleBlink = () => after(nextBlinkDelay(Math.random()), () => {
      const twice = isDoubleBlink(Math.random())
      closeEyes(() => {
        if (twice) after(BLINK_GAP_MS, () => closeEyes(scheduleBlink))
        else scheduleBlink()
      })
    })
    scheduleBlink()
    return () => {
      disposed = true
      window.clearTimeout(timer)
    }
  }, [reducedMotion])

  return (
    <>
      <div
        className="teacher-npc-anchor"
        style={{ left: `${NPC_HUB_POSITION.x}%`, top: `${NPC_HUB_POSITION.y}%` }}
      >
        {marker !== 'none' && (
          <span className="teacher-npc-marker" data-testid="npc-marker" data-marker={marker} aria-hidden="true">
            {MARKER_SYMBOLS[marker]}
          </span>
        )}
        {(speech || near) && (
          <span className={`teacher-npc-speech${speech ? '' : ' hint'}`} aria-hidden="true">
            {speech || 'แตะเพื่อพูดคุย (E)'}
          </span>
        )}
        <button
          type="button"
          className="teacher-npc"
          data-testid="teacher-npc"
          aria-label={`พูดคุยกับ${TEACHER_NPC_NAME} ${TEACHER_NPC_ROLE}`}
          onClick={openDialogue}
        >
          <span className="teacher-npc-name"><b>{TEACHER_NPC_NAME}</b><small>{TEACHER_NPC_ROLE}</small></span>
          <span
            className="teacher-npc-art"
            data-pose="idle"
            data-frame={frame}
            style={npcSpriteStyle('idle', frame)}
            aria-hidden="true"
          />
          <span className="teacher-npc-shadow" aria-hidden="true" />
        </button>
      </div>

      {tracked && (
        <button type="button" className="teacher-quest-tracker" data-testid="npc-tracker" onClick={() => {
          setSelectedQuestId(tracked.questId)
          openDialogue()
        }}>
          <b><span aria-hidden="true">◆</span> {tracked.title}</b>
          {tracked.objectives.map((objective) => (
            <small key={objective.key} data-done={objective.done}>
              <i aria-hidden="true">{objective.done ? '✓' : '○'}</i> {objective.label} {objective.done ? '1/1' : '0/1'}
            </small>
          ))}
          <em>{trackerHint(tracked)}</em>
        </button>
      )}

      {rewardPops.length > 0 && createPortal(
        <div className="npc-reward-pops" aria-hidden="true">
          {rewardPops.map((pop) => (
            <span key={pop.id} style={{ animationDelay: `${pop.index * 0.12}s` }}>{pop.text}</span>
          ))}
        </div>,
        document.body,
      )}

      {toastVisible && createPortal(
        <button
          type="button"
          className="teacher-quest-toast"
          data-testid="npc-toast"
          onClick={() => {
            setToastVisible(false)
            openDialogue()
          }}
        >
          <span aria-hidden="true">📜</span> มีภารกิจใหม่จาก{TEACHER_NPC_NAME}!
          <i
            role="button"
            tabIndex={0}
            aria-label="ปิดการแจ้งเตือนภารกิจ"
            onClick={(event) => {
              event.stopPropagation()
              setToastVisible(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.stopPropagation()
                setToastVisible(false)
              }
            }}
          >×</i>
        </button>,
        document.body,
      )}

      {dialogueOpen && createPortal(
        <div
          className="npc-dialogue-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`บทสนทนากับ${TEACHER_NPC_NAME}`}
          data-testid="npc-dialogue"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialogue()
          }}
        >
          <div className="npc-dialogue-panel">
            <button type="button" className="npc-dialogue-close" aria-label="ปิดบทสนทนา" onClick={closeDialogue}>×</button>
            <div className="npc-dialogue-header">
              <span className="npc-dialogue-portrait" aria-hidden="true"><i style={npcPortraitStyle()} /></span>
              <div><b>{TEACHER_NPC_NAME}</b><small>{TEACHER_NPC_ROLE}</small></div>
            </div>

            {status === 'error' && (
              <div className="npc-dialogue-body">
                <p className="npc-dialogue-message">ยังโหลดภารกิจไม่สำเร็จ กรุณาลองใหม่</p>
                <div className="npc-dialogue-actions">
                  <button type="button" className="npc-btn primary" onClick={() => void load(false)}>ลองใหม่</button>
                  <button type="button" className="npc-btn" onClick={closeDialogue}>ปิด</button>
                </div>
              </div>
            )}

            {status !== 'error' && !selected && (
              <div className="npc-dialogue-body">
                <p className="npc-dialogue-message">
                  {status === 'loading' || status === 'idle'
                    ? 'ครูกำลังเปิดสมุดภารกิจ รอสักครู่นะ...'
                    : 'สวัสดีนักผจญภัย วันนี้ยังไม่มีภารกิจใหม่ ตั้งใจฝึกฝนและทบทวนบทเรียนต่อไปนะ'}
                </p>
                <div className="npc-dialogue-actions">
                  <button type="button" className="npc-btn" onClick={closeDialogue}>ปิด</button>
                </div>
              </div>
            )}

            {status !== 'error' && selected && (
              <div className="npc-dialogue-body">
                {orderedViews.length > 1 && (
                  <div className="npc-quest-switcher" role="tablist" aria-label="เลือกภารกิจ">
                    {orderedViews.map((view) => (
                      <button
                        key={view.questId}
                        type="button"
                        role="tab"
                        aria-selected={view.questId === selected.questId}
                        className={view.questId === selected.questId ? 'active' : ''}
                        onClick={() => {
                          setSelectedQuestId(view.questId)
                          setDetailOpen(false)
                          setActionError('')
                        }}
                      >{view.title}</button>
                    ))}
                  </div>
                )}

                <div className="npc-quest-heading">
                  <h3>{selected.title}</h3>
                  <span className="npc-quest-status" data-status={selected.studentStatus}>
                    {STUDENT_STATUS_LABELS[selected.studentStatus]}
                  </span>
                </div>
                {selected.dueAt && <p className="npc-quest-due">กำหนดส่ง: {selected.dueAt}</p>}

                {!detailOpen && <>
                  <p className="npc-dialogue-message">“{dialogueForQuest(selected).message}”</p>
                  {actionError && <p role="alert" className="npc-dialogue-error">{actionError}</p>}
                  <div className="npc-dialogue-actions">
                    {dialogueForQuest(selected).buttons.map((button) => (
                      <button
                        key={button.action}
                        type="button"
                        disabled={busy}
                        className={`npc-btn${['accept', 'turnIn', 'continue'].includes(button.action) ? ' primary' : ''}`}
                        onClick={() => void runAction(button.action, selected)}
                      >{busy && ['accept', 'turnIn'].includes(button.action) ? '⏳ กำลังดำเนินการ...' : button.label}</button>
                    ))}
                  </div>
                </>}

                {detailOpen && (
                  <div className="npc-quest-detail" data-testid="npc-quest-detail">
                    <dl>
                      <div><dt>บทเรียน</dt><dd>{selected.lessonTitle || selected.lessonId}</dd></div>
                      <div><dt>ผู้มอบหมาย</dt><dd>{TEACHER_NPC_NAME}</dd></div>
                      {selected.npcMessage && <div><dt>คำสั่งภารกิจ</dt><dd>{selected.npcMessage}</dd></div>}
                      {selected.dueAt && <div><dt>กำหนดส่ง</dt><dd>{selected.dueAt}</dd></div>}
                    </dl>
                    <h4>เป้าหมาย</h4>
                    <ul className="npc-quest-objectives">
                      {selected.objectives.map((objective) => (
                        <li key={objective.key} data-done={objective.done}>
                          <i aria-hidden="true">{objective.done ? '✓' : '○'}</i> {objective.label}
                        </li>
                      ))}
                    </ul>
                    {selected.hasRewards && (
                      <>
                        <h4>รางวัลเมื่อส่งงาน</h4>
                        <ul className="npc-quest-rewards" data-testid="npc-quest-rewards">
                          {describeQuestRewards(selected.earnable).map((line) => <li key={line}>{line}</li>)}
                        </ul>
                        {selected.rewards.bonusXp + selected.rewards.bonusCoins > 0 && (
                          <p className="npc-quest-reward-note">
                            {selected.earnable.earlyBonusApplied
                              ? `🎯 รวมโบนัสส่งก่อนกำหนดแล้ว (ส่งภายใน ${selected.dueAt})`
                              : '🎯 เลยกำหนดส่งแล้ว จึงไม่ได้รับโบนัสส่งก่อนกำหนด'}
                          </p>
                        )}
                      </>
                    )}
                    {selected.worksheetReward && (
                      <p className="npc-quest-reward-note">
                        และการส่งใบงานครั้งแรกได้ +{selected.worksheetReward.xp} XP · +{selected.worksheetReward.coins} เหรียญ แยกต่างหาก
                      </p>
                    )}
                    <div className="npc-dialogue-actions">
                      <button type="button" className="npc-btn" onClick={() => setDetailOpen(false)}>กลับ</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}

      {celebration && createPortal(
        <div className="npc-celebration-backdrop" role="dialog" aria-modal="true" aria-label="ภารกิจสำเร็จ" data-testid="npc-celebration">
          <div className="npc-celebration-panel">
            <span className="npc-celebration-sparkles" aria-hidden="true"><i>✦</i><i>✧</i><i>✦</i><i>✧</i><i>✦</i></span>
            <span className="npc-celebration-sprite" aria-hidden="true"><i style={npcSpriteStyle('celebrate', CELEBRATE_OVERLAY_FRAME, 0.62)} /></span>
            <h3>ภารกิจสำเร็จ!</h3>
            <p className="npc-celebration-title">{celebration.view.title}</p>
            {celebration.earned && describeQuestRewards(celebration.earned).length > 0 && (
              <div className="npc-celebration-rewards">
                {describeQuestRewards(celebration.earned).map((line) => <span key={line}>{line}</span>)}
              </div>
            )}
            {celebration.earned?.earlyBonusApplied && (
              <p className="npc-celebration-bonus">🎯 รวมโบนัสส่งก่อนกำหนดแล้ว!</p>
            )}
            {celebration.leveledUpTo && (
              <p className="npc-celebration-levelup" data-testid="npc-celebration-levelup">
                <b>LEVEL UP!</b> <span>เลเวล {celebration.leveledUpTo}</span>
              </p>
            )}
            <p className="npc-celebration-note">
              {celebration.earned && describeQuestRewards(celebration.earned).length > 0
                ? 'ครูมอบรางวัลให้เรียบร้อยแล้ว เก่งมาก!'
                : 'ครูรับงานเรียบร้อยแล้ว เก่งมาก!'}
            </p>
            <button type="button" className="npc-btn primary" onClick={closeCelebration}>รับรางวัล</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
