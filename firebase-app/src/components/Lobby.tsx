export type LobbyMode = 'adventure' | 'pvp' | 'world-boss' | 'cyber-safety'

type Props = {
  onSelectMode(mode: LobbyMode): void
  onDailyReward?(): void
  onRank?(): void
}

const modes: Array<{
  id: LobbyMode
  title: string
  description: string
  action: string
  theme: string
}> = [
  {
    id: 'adventure',
    title: 'ผจญภัยในบทเรียน',
    description: 'ตะลุยด่าน รู้ทันบอส เก็บเกี่ยวความรู้และตามล่าหาไอเทมแรร์!',
    action: 'เข้าสู่โลกกว้าง',
    theme: 'adventure',
  },
  {
    id: 'pvp',
    title: 'ท้าสู้กับเพื่อน (PVP)',
    description: 'ประลองความรู้แบบ 1v1 ใครจะแน่กว่ากัน ท้าเพื่อนในห้องมาวัดกันเลย!',
    action: 'เข้าสู่สนามประลอง',
    theme: 'pvp',
  },
  {
    id: 'world-boss',
    title: 'มินิเกม (AI Camera)',
    description: 'ใช้กล้องเว็บแคมตรวจจับท่าทาง กายบริหารไปพร้อมกับมินิเกมสุดเร้าใจ!',
    action: 'เข้าสู่มินิเกม',
    theme: 'minigame',
  },
  {
    id: 'cyber-safety',
    title: 'ผู้พิทักษ์ไซเบอร์',
    description: 'ช่วยน้องเซฟตัดสินใจ แก้ปัญหาสถานการณ์ภัยอันตรายในโลกไซเบอร์!',
    action: 'เข้าสู่โลกไซเบอร์',
    theme: 'cyber',
  },
]

export function Lobby({ onSelectMode, onDailyReward, onRank }: Props) {
  return (
    <section id="page-lobby" className="mode-lobby">
      <div data-testid="lobby-background" className="mode-lobby-background" aria-hidden="true" />
      <div className="mode-lobby-vignette" aria-hidden="true" />

      <header className="mode-lobby-heading">
        <h2>เลือกโหมดการเล่น</h2>
        <p>คุณพร้อมจะลุยแบบไหน?</p>
      </header>

      <nav className="mode-lobby-utilities" aria-label="เมนูผู้เล่น">
        <button type="button" onClick={onDailyReward}>
          <span aria-hidden="true">🎁</span> รางวัลประจำวัน
        </button>
        <button type="button" onClick={onRank}>
          <span aria-hidden="true">🏆</span> อันดับ
        </button>
      </nav>

      <div className="mode-lobby-cards">
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            aria-label={mode.title}
            aria-describedby={`mode-description-${mode.id}`}
            data-testid="lobby-mode-card"
            onClick={() => onSelectMode(mode.id)}
            className={`mode-lobby-card ${mode.theme}`}
          >
            <span className="sr-only">
              <strong>{mode.title}</strong>
              <span id={`mode-description-${mode.id}`}>{mode.description}</span>
              <span>{mode.action}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
