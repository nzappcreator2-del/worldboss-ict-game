export type LobbyMode = 'adventure' | 'pvp' | 'world-boss' | 'cyber-safety'

type Props = { onSelectMode(mode: LobbyMode): void }

const modes: Array<{
  id: LobbyMode
  title: string
  description: string
  action: string
  icon: string
  badge?: string
  shell: string
  border: string
  heading: string
  text: string
  button: string
}> = [
  {
    id: 'adventure',
    title: 'ผจญภัยในบทเรียน',
    description: 'ตะลุยด่าน สู้กับมอนสเตอร์เพื่อเก็บเกี่ยวความรู้และตามล่าหาไอเทมแรร์!',
    action: 'เข้าสู่โลกกว้าง',
    icon: '🛡️',
    shell: 'from-emerald-400 to-green-600 border-green-200',
    border: 'border-green-700',
    heading: 'text-green-800',
    text: 'text-green-700',
    button: 'bg-green-500 border-green-800 group-hover:bg-green-400',
  },
  {
    id: 'pvp',
    title: 'ท้าสู้กับเพื่อน (PVP)',
    description: 'ประลองความรู้แบบ 1v1 ใครจะแน่กว่ากัน ท้าเพื่อนในห้องมาวัดกันเลย!',
    action: 'เข้าสู่ลานประลอง',
    icon: '⚔️',
    badge: 'NEW!',
    shell: 'from-orange-400 to-red-600 border-red-200',
    border: 'border-red-700',
    heading: 'text-red-800',
    text: 'text-red-700',
    button: 'bg-red-500 border-red-800 group-hover:bg-red-400',
  },
  {
    id: 'world-boss',
    title: 'มินิเกม (AI Camera)',
    description: 'ใช้กล้องเว็บแคมตรวจจับท่าทาง กายบริหารเพื่อเอาชนะสมรภูมิมาริโอ้และมินิเกมสุดเร้าใจ!',
    action: 'เข้าสู่มินิเกม',
    icon: '🤖',
    badge: 'HOT!',
    shell: 'from-purple-400 to-indigo-600 border-purple-200',
    border: 'border-purple-700',
    heading: 'text-purple-800',
    text: 'text-purple-700',
    button: 'bg-purple-500 border-purple-800 group-hover:bg-purple-400',
  },
  {
    id: 'cyber-safety',
    title: 'ผู้พิทักษ์ภัยไซเบอร์',
    description: 'ช่วย “น้องเซฟ” ตัดสินใจแก้ปัญหาสนทนาและภัยอันตรายบนโซเชียลมีเดีย!',
    action: 'เข้าสู่โลกไซเบอร์',
    icon: '🛡️💻',
    badge: 'NEW!',
    shell: 'from-cyan-400 to-blue-600 border-cyan-200',
    border: 'border-blue-700',
    heading: 'text-blue-800',
    text: 'text-blue-700',
    button: 'bg-blue-500 border-blue-800 group-hover:bg-blue-400',
  },
]

export function Lobby({ onSelectMode }: Props) {
  return (
    <section id="page-lobby" className="flex-1 hidden flex-col items-center justify-start md:justify-center relative overflow-x-hidden overflow-y-auto py-12 md:py-8">
      <div className="absolute inset-0 pointer-events-none flex justify-between items-start px-10 pt-10 opacity-40">
        <div className="text-6xl animate-bounce" style={{ animationDuration: '4s' }}>☁️</div>
        <div className="text-7xl animate-bounce" style={{ animationDuration: '6s', transform: 'scaleX(-1)' }}>☁️</div>
      </div>

      <div className="z-10 text-center mb-8 mt-8 shrink-0">
        <h2
          className="text-5xl md:text-6xl font-black text-white drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)]"
          style={{ textShadow: '3px 3px 0 #b45309, -1px -1px 0 #b45309, 1px -1px 0 #b45309, -1px 1px 0 #b45309, 1px 1px 0 #b45309' }}
        >
          เลือกโหมดการเล่น
        </h2>
        <p className="text-xl text-yellow-200 font-bold mt-2 drop-shadow-md">คุณพร้อมจะลุยแบบไหน?</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 z-10 w-full max-w-6xl px-4 justify-center items-stretch pb-8 shrink-0">
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            aria-label={mode.title}
            onClick={() => onSelectMode(mode.id)}
            className={`group relative w-full bg-gradient-to-b ${mode.shell} rounded-3xl p-1.5 cursor-pointer transform transition-all duration-300 hover:scale-105 hover:-translate-y-2 shadow-[0_10px_20px_rgba(0,0,0,0.4)] border-4 text-left`}
          >
            <span className={`bg-white/95 backdrop-blur-sm rounded-2xl p-5 text-center h-full flex flex-col border-4 ${mode.border} relative overflow-hidden`}>
              <span className="absolute inset-0 opacity-10 pointer-events-none bg-amber-900/20" />
              {mode.badge && <span className="absolute top-2 left-2 bg-slate-800 text-white text-[10px] font-black px-2 py-0.5 rounded shadow-sm z-10 -rotate-12 animate-pulse">{mode.badge}</span>}
              <span className="w-full h-36 flex items-center justify-center mb-2 relative z-10">
                <span className="w-28 h-28 rounded-full bg-gradient-to-br from-white to-slate-100 border-4 border-white shadow-[0_8px_18px_rgba(0,0,0,0.2)] flex items-center justify-center text-6xl transition-transform duration-500 group-hover:scale-110">
                  {mode.icon}
                </span>
              </span>
              <span className={`text-2xl font-black ${mode.heading} drop-shadow-sm mb-2 relative z-10 mt-2`}>{mode.title}</span>
              <span className={`${mode.text} font-bold mb-6 relative z-10 text-xs md:text-sm leading-relaxed`}>{mode.description}</span>
              <span className="mt-auto pt-4 relative z-10">
                <span className={`w-full py-2.5 text-white font-black text-lg rounded-xl border-b-4 shadow-md transition-colors flex justify-center items-center gap-2 ${mode.button}`}>
                  {mode.action} <span aria-hidden="true">▶</span>
                </span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
