import { useCallback, useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { DAILY_QUEST_DEFAULTS, type DailyQuestConfig } from '../services/gameLogic'

export type DashboardUser = { id: string; coins?: number; xp?: number }
export type DashboardNews = { id?: string; title: string; content: string; icon?: string; type?: string; date?: string; updatedAtMs?: number }
export type DailyStatus = { success: boolean; progress?: Record<string, number>; done?: string[]; error?: string }
export type RewardResult = { success: boolean; coins?: number; xp?: number; error?: string; inventory?: unknown }
export type DailyQuestsResult = { success: boolean; data?: DailyQuestConfig[]; error?: string }

export type DashboardHomeService = {
  getCurrentUser(): DashboardUser | null
  getNews(): DashboardNews[]
  subscribeNews?(onNews: (news: DashboardNews[]) => void, onError?: (error: Error) => void): () => void
  loadDailyStatus(userId: string): Promise<DailyStatus>
  /** Admin-configurable quest catalog; omitted or failing → code defaults. */
  loadDailyQuests?(): Promise<DailyQuestsResult>
  claimQuest(userId: string, questId: string, coins: number, xp: number): Promise<RewardResult>
}

type Props = {
  service: DashboardHomeService
  onUserReward(reward: { coins?: number; xp?: number; inventory?: unknown }): void
}

const questRewardLabel = (quest: DailyQuestConfig) => quest.coins > 0
  ? `🪙 ${quest.coins} Coins${quest.xp > 0 ? ` · ⭐ ${quest.xp} XP` : ''}`
  : `⭐ ${quest.xp} XP`

export function DashboardHome({ service, onUserReward }: Props) {
  const [news, setNews] = useState<DashboardNews[]>(() => service.getNews())
  const [questConfig, setQuestConfig] = useState<DailyQuestConfig[]>(DAILY_QUEST_DEFAULTS)
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [done, setDone] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [claiming, setClaiming] = useState<string | null>(null)
  const [claimError, setClaimError] = useState('')
  const [detailPanel, setDetailPanel] = useState<'quests' | 'news' | null>(null)

  const load = useCallback(async () => {
    const user = service.getCurrentUser()
    if (!user) return
    setStatus('loading')
    if (!service.subscribeNews) setNews(service.getNews())
    try {
      const [result, questResult] = await Promise.all([
        service.loadDailyStatus(user.id),
        // Quest catalog failures fall back to the defaults silently — a
        // config hiccup must never take the whole board down.
        service.loadDailyQuests?.().catch(() => undefined),
      ])
      if (!result.success) throw new Error(result.error || 'load failed')
      if (questResult?.success && questResult.data?.length) setQuestConfig(questResult.data)
      setProgress(result.progress || {})
      setDone((result.done || []).map(String))
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [service])

  useEffect(() => {
    void load()
    window.addEventListener('nextgen:open-home', load)
    window.addEventListener('nextgen:login-complete', load)
    return () => {
      window.removeEventListener('nextgen:open-home', load)
      window.removeEventListener('nextgen:login-complete', load)
    }
  }, [load])

  useEffect(() => {
    if (!service.subscribeNews) return
    return service.subscribeNews(setNews)
  }, [service])

  useEffect(() => {
    if (!detailPanel) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailPanel(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [detailPanel])

  // The shell's quest tracker (and anything else on the HUD) can pop the
  // daily-quest board open without knowing about this component's state.
  useEffect(() => {
    const openQuests = () => setDetailPanel('quests')
    window.addEventListener('nextgen:open-daily-quests', openQuests)
    return () => window.removeEventListener('nextgen:open-daily-quests', openQuests)
  }, [])

  const sortedNews = useMemo(() => [...news].sort((a, b) => {
    const time = (item: DashboardNews) => {
      if (typeof item.updatedAtMs === 'number') return item.updatedAtMs
      const thaiDate = String(item.date || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (thaiDate) {
        const year = Number(thaiDate[3]) > 2400 ? Number(thaiDate[3]) - 543 : Number(thaiDate[3])
        return Date.UTC(year, Number(thaiDate[2]) - 1, Number(thaiDate[1]))
      }
      const parsed = Date.parse(String(item.date || ''))
      return Number.isFinite(parsed) ? parsed : 0
    }
    return time(b) - time(a)
  }), [news])
  const latestNews = sortedNews[0]
  const pendingQuests = questConfig.filter((quest) => !done.includes(quest.id))

  // MMO-style system feed for the chat window. Deliberately paraphrases the
  // boards (counts, nudges) instead of repeating their exact text so the two
  // surfaces never fight over the same information.
  const chatLines = useMemo(() => {
    const lines: Array<{ tag: string; tone: string; text: string }> = [
      { tag: 'ระบบ', tone: 'system', text: 'ยินดีต้อนรับกลับมา ผู้กล้า! ขอให้สนุกกับการผจญภัยวันนี้' },
    ]
    if (status === 'ready') {
      lines.push({
        tag: 'ภารกิจ', tone: 'quest',
        text: pendingQuests.length > 0
          ? `ภารกิจประจำวันเหลืออีก ${pendingQuests.length} รายการ — เปิดป้ายภารกิจเพื่อรับรางวัล`
          : 'สุดยอด! วันนี้ทำภารกิจครบทุกรายการแล้ว',
      })
    } else {
      lines.push({ tag: 'ภารกิจ', tone: 'quest', text: 'กำลังซิงก์ภารกิจประจำวันจากกิลด์...' })
    }
    if (sortedNews.length > 0) {
      lines.push({ tag: 'ประกาศ', tone: 'news', text: `มีประกาศจากครูทั้งหมด ${sortedNews.length} เรื่อง — อ่านได้ที่ป้ายประกาศข่าวสาร` })
    }
    lines.push({ tag: 'เคล็ดลับ', tone: 'tip', text: 'ใช้ปุ่มลูกศร คลิกพื้น หรือจอยสติ๊ก เพื่อเดินสำรวจห้องกิลด์ได้เลย' })
    return lines
  }, [status, pendingQuests.length, sortedNews.length])

  const claim = async (quest: DailyQuestConfig) => {
    const user = service.getCurrentUser()
    if (!user || claiming) return
    setClaiming(quest.id)
    setClaimError('')
    try {
      const result = await service.claimQuest(user.id, quest.id, quest.coins, quest.xp)
      if (!result.success) throw new Error(result.error || 'claim failed')
      setDone((current) => current.includes(quest.id) ? current : [...current, quest.id])
      onUserReward({ coins: result.coins, xp: result.xp, inventory: result.inventory })
    } catch {
      setClaimError('รับรางวัลไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setClaiming(null)
    }
  }

  const renderQuest = (quest: DailyQuestConfig, detailed = false) => {
    const current = quest.id === 'login' ? 1 : Number(progress[quest.id] || 0)
    const finished = current >= quest.target
    const claimed = done.includes(quest.id)
    const percent = Math.min(100, (current / quest.target) * 100)
    return <article key={quest.id} className={`dashboard-quest-row ${detailed ? 'detailed' : 'compact'} ${claimed ? 'claimed' : ''}`}>
      <span className="dashboard-quest-icon" aria-hidden="true">{quest.id === 'login' ? '🪙' : quest.id === 'play1' ? '👟' : '💬'}</span>
      <div className="dashboard-quest-copy">
        <div><h4>{quest.title}</h4><span>{questRewardLabel(quest)}</span></div>
        <p>{quest.description}</p>
        <div className="dashboard-quest-progress"><i style={{ width: `${percent}%` }} /><span>{Math.min(current, quest.target)} / {quest.target}</span></div>
        {detailed && finished && !claimed && <button type="button" disabled={claiming !== null} aria-label={`รับรางวัล ${quest.title}`} onClick={() => claim(quest)}>{claiming === quest.id ? 'กำลังรับ...' : 'รับรางวัล'}</button>}
        {detailed && claimed && <strong className="dashboard-quest-cleared">✅ เคลียร์เรียบร้อย</strong>}
      </div>
    </article>
  }

  const renderNews = (item: DashboardNews, index: number, detailed = false) => <article
    key={item.id || `${item.title}-${index}`}
    className={`dashboard-news-item ${detailed ? 'detailed' : 'compact'}`}
  >
    <h3>{item.icon || '📌'} <span>{item.title}</span></h3>
    <p>{item.content}</p>
    <div><span>{item.type || 'ประกาศ'}</span><span>{item.date ? `อัปเดตเมื่อ: ${item.date}` : ''}</span></div>
  </article>

  const activateBoard = (panel: 'quests' | 'news', event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setDetailPanel(panel)
    }
  }

  return (
    <div id="dash-tab-home" className={`dashboard-home-layout ${detailPanel ? 'detail-open' : ''}`}>
      {/* The stage replicates the background's cover-crop geometry so the two
          boards track the painted signs at any viewport aspect ratio. */}
      <div className="dashboard-board-stage">
      <section
        role={status === 'error' ? undefined : 'button'}
        tabIndex={status === 'error' ? -1 : 0}
        aria-label="เปิดรายละเอียดภารกิจทั้งหมด"
        className="dashboard-daily-board dashboard-board-trigger"
        onClick={() => status !== 'error' && setDetailPanel('quests')}
        onKeyDown={(event) => activateBoard('quests', event)}
      >
        <h3 id="daily-quest-title" className="sr-only">ภารกิจประจำวัน</h3>
        <div className="dashboard-board-scroll">
          {status === 'idle' && <p className="dashboard-board-message">เลือกหน้าหลักเพื่อโหลดภารกิจ</p>}
          {status === 'loading' && <p className="dashboard-board-message">กำลังโหลดภารกิจ...</p>}
          {status === 'error' && <div className="dashboard-board-message"><p>โหลดภารกิจไม่สำเร็จ</p><button type="button" onClick={load}>ลองใหม่</button></div>}
          {status === 'ready' && pendingQuests.length === 0 && <div className="dashboard-board-message dashboard-all-clear">🏆 ภารกิจวันนี้สำเร็จครบแล้ว</div>}
          {status === 'ready' && pendingQuests.length > 0 && <div className="dashboard-quest-list">{pendingQuests.map((quest) => renderQuest(quest))}</div>}
        </div>
        <span className="dashboard-board-hint">ดูภารกิจทั้งหมด ›</span>
      </section>

      <section
        role="button"
        tabIndex={0}
        aria-label="เปิดประกาศทั้งหมด"
        className="dashboard-news-board dashboard-board-trigger"
        onClick={() => setDetailPanel('news')}
        onKeyDown={(event) => activateBoard('news', event)}
      >
        <div className="dashboard-board-scroll">
          {status === 'idle' && <p className="dashboard-board-message">ข่าวสารจาก NextGen Play</p>}
          {status === 'ready' && !latestNews && <div className="dashboard-board-message">ขณะนี้ยังไม่มีประกาศใหม่</div>}
          {latestNews && renderNews(latestNews, 0)}
        </div>
        <span className="dashboard-board-hint">ประกาศทั้งหมด ›</span>
      </section>
      </div>

      {/* MMO chat-style system feed anchored above the EXP bar. */}
      <aside className="dashboard-chat-log" data-testid="dashboard-chat-log" aria-label="กล่องข้อความระบบ">
        <header><span aria-hidden="true">💬</span> ข้อความ</header>
        <div className="dashboard-chat-lines">
          {chatLines.map((line, index) => (
            <p key={`${line.tag}-${index}`} className={`dashboard-chat-line chat-${line.tone}`}>
              <b>[{line.tag}]</b> {line.text}
            </p>
          ))}
        </div>
      </aside>

      {detailPanel && <div
        className="dashboard-detail-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label={detailPanel === 'quests' ? 'รายละเอียดภารกิจประจำวัน' : 'ประกาศข่าวสารทั้งหมด'}
        onMouseDown={(event) => {
          if (event.currentTarget === event.target) setDetailPanel(null)
        }}
      >
        <section className={`dashboard-detail-panel ${detailPanel}`}>
          <header>
            <span aria-hidden="true">{detailPanel === 'quests' ? '📜' : '📢'}</span>
            <div>
              <h2>{detailPanel === 'quests' ? 'ภารกิจประจำวัน' : 'ประกาศข่าวสาร'}</h2>
              <p>{detailPanel === 'quests' ? 'ทำภารกิจ รับรางวัล และเติบโตเป็นนักผจญภัย' : 'ข่าวสารและกิจกรรมล่าสุดจาก NextGen Play'}</p>
            </div>
            <button type="button" aria-label="ปิดรายละเอียด" onClick={() => setDetailPanel(null)}>×</button>
          </header>
          <div className="dashboard-detail-content">
            {detailPanel === 'quests' && <div className="dashboard-detail-quest-list">{questConfig.map((quest) => renderQuest(quest, true))}</div>}
            {detailPanel === 'news' && <div className="dashboard-detail-news-list">
              {sortedNews.length === 0 ? <p className="dashboard-detail-empty">ยังไม่มีประกาศในขณะนี้</p> : sortedNews.map((item, index) => renderNews(item, index, true))}
            </div>}
            {claimError && detailPanel === 'quests' && <p role="alert" className="dashboard-claim-error">{claimError}</p>}
          </div>
        </section>
      </div>}
    </div>
  )
}
