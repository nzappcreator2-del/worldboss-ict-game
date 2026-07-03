import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export type MapLesson = {
  id: string
  title: string
  description: string
  icon: string
}

export type MapUser = {
  id: string
  avatar?: string
  passedLessons?: string[]
}

export type MapResult = {
  success: boolean
  data?: MapLesson[]
  passedLessons?: string[]
  error?: string
}

export type MapService = {
  getCurrentUser(): MapUser | null
  loadLessons(userId: string): Promise<MapResult>
}

type Props = {
  service: MapService
  onSelectLesson(lessonId: string): void
}

const positions = [
  [25, 88], [60, 82], [80, 65], [45, 55], [18, 45],
  [45, 35], [80, 25], [58, 15], [35, 12], [15, 8],
]

export function AdventureMap({ service, onSelectLesson }: Props) {
  const [lessons, setLessons] = useState<MapLesson[]>([])
  const [passed, setPassed] = useState<string[]>([])
  const [avatar, setAvatar] = useState('🧙‍♂️')
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [preview, setPreview] = useState<MapLesson | null>(null)

  const load = useCallback(async () => {
    const user = service.getCurrentUser()
    if (!user) return
    setStatus('loading')
    setPreview(null)
    setAvatar(user.avatar || '🧙‍♂️')
    try {
      const result = await service.loadLessons(user.id)
      if (!result.success) throw new Error(result.error || 'load failed')
      setLessons(result.data || [])
      setPassed((result.passedLessons || user.passedLessons || []).map(String))
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [service])

  useEffect(() => {
    window.addEventListener('nextgen:open-map', load)
    return () => window.removeEventListener('nextgen:open-map', load)
  }, [load])

  useEffect(() => {
    if (!preview) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreview(null) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [preview])

  let foundCurrent = false

  return (
    <div id="dash-tab-map" className="flex flex-1 flex-col rounded-2xl overflow-hidden relative glass-card bg-white/70 backdrop-blur-md border-[3px] md:border-4 border-white/80 shadow-2xl p-1 md:p-3">
      <div className="absolute top-4 left-4 z-30 pointer-events-none drop-shadow-lg">
        <h2 className="font-mali text-4xl md:text-5xl font-black text-[#5a78b5] tracking-wide" style={{ textShadow: '3px 3px 0 #fff, -3px -3px 0 #fff, 0 8px 15px rgba(0,0,0,.2)' }}>
          แผนที่ผจญภัย
        </h2>
      </div>
      <div className="rpg-box rpg-box-wood flex-1 relative overflow-auto rounded-3xl border-[6px] border-[#8b5a2b] shadow-2xl m-1 md:m-2 mt-24 md:mt-2 bg-[#a7f3d0]">
        <div className="relative w-[1000px] md:w-full h-full min-h-[562px] mx-auto bg-center bg-no-repeat" style={{ backgroundImage: "url('https://i.postimg.cc/FFTrYGRw/hn-ale-xkmap.png')", backgroundSize: '100% 100%' }}>
          {status === 'loading' && <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 text-white font-bold">กำลังสอดแนมพื้นที่...</div>}
          {status === 'error' && <div className="absolute inset-0 z-40 flex flex-col gap-3 items-center justify-center bg-black/40"><p className="bg-white px-5 py-3 rounded-xl font-bold text-red-600">โหลดแผนที่ไม่สำเร็จ</p><button className="px-5 py-2 bg-blue-600 text-white rounded-xl font-bold" onClick={load}>ลองใหม่</button></div>}
          {status === 'ready' && lessons.length === 0 && <div className="absolute inset-0 flex items-center justify-center"><div className="bg-white/85 p-6 rounded-2xl text-center"><div className="text-4xl">🚧</div><h3 className="text-xl font-bold">ยังไม่มีด่านผจญภัย</h3></div></div>}
          {lessons.map((lesson, index) => {
            const unlocked = index === 0 || passed.includes(String(lessons[index - 1]?.id))
            const cleared = passed.includes(String(lesson.id))
            const current = unlocked && !cleared && !foundCurrent
            if (current) foundCurrent = true
            const [x, y] = positions[index] || [index % 2 ? 70 : 30, 90 + (index - positions.length) * 15]
            return (
              <div key={lesson.id} className={`absolute -translate-x-1/2 -translate-y-1/2 group ${current ? 'z-[60]' : 'z-20'}`} style={{ left: `${x}%`, top: `${y}%` }}>
                {current && <div className="absolute -top-14 left-1/2 -translate-x-1/2 text-4xl bg-white rounded-full w-14 h-14 flex items-center justify-center border-4 border-[#5a78b5] shadow-lg animate-bounce">{avatar}</div>}
                <button
                  type="button"
                  disabled={!unlocked}
                  aria-label={unlocked ? `เล่นด่าน ${lesson.title}` : `ด่านล็อก ${lesson.title}`}
                  onClick={() => setPreview(lesson)}
                  className={`relative w-16 h-16 md:w-20 md:h-20 rounded-full border-4 flex items-center justify-center text-3xl md:text-4xl shadow-xl transition-transform ${unlocked ? 'bg-yellow-100 border-yellow-500 hover:scale-110' : 'bg-gray-300 border-gray-500 grayscale opacity-70 cursor-not-allowed'}`}
                >
                  {unlocked ? lesson.icon : '🔒'}
                  <span className="absolute -top-2 -right-2 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold border-2 border-white">{cleared ? '✓' : index + 1}</span>
                </button>
                <div className={`absolute left-1/2 -translate-x-1/2 w-[220px] bg-[#d4a373] border-4 border-[#8b5a2b] rounded-xl px-4 py-2 text-center shadow-lg pointer-events-none ${current ? 'bottom-full mb-16' : 'bottom-full mb-2 opacity-0 group-hover:opacity-100'}`}>
                  <h4 className="font-bold text-[#5c3a21] text-sm">{lesson.title}</h4>
                  <p className="text-[10px] font-bold text-[#5c3a21]">{!unlocked ? '🔒 ต้องผ่านด่านก่อนหน้า' : cleared ? '⭐ เล่นซ้ำได้' : 'คลิกบุกโจมตี ⚔️'}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {preview && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-md" role="dialog" aria-label="ตัวอย่างบทเรียน" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null) }}>
          <div className="relative w-full max-w-sm rounded-md border-4 border-[#8b5a2b] bg-[#e6d5b8] p-6 text-center shadow-[0_0_30px_rgba(0,0,0,0.8)] md:p-8" style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/aged-paper.png')" }}>
            <div className="absolute -top-4 left-1/2 h-8 w-8 -translate-x-1/2 rounded-full border-4 border-gray-600 bg-gray-300 shadow-md" />
            <button type="button" aria-label="ปิดตัวอย่างบทเรียน" onClick={() => setPreview(null)} className="absolute -right-3 -top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border-4 border-red-900 bg-red-600 text-xl font-bold text-white shadow-lg transition-transform hover:scale-110 hover:bg-red-500">×</button>
            <h3 className="mb-1 mt-2 font-mali text-3xl font-black tracking-wide text-[#5c3a21] md:text-4xl">🔥 จุดหมายถัดไป 🔥</h3>
            <div className="mx-auto mb-4 mt-2 h-1 w-24 rounded-full bg-[#5c3a21] opacity-50" />
            <div className="relative mx-auto mb-4 flex h-32 w-32 items-center justify-center overflow-hidden rounded-lg border-4 border-[#5c3a21] bg-gradient-to-b from-gray-200 to-gray-400 text-6xl shadow-inner md:h-40 md:w-40 md:text-7xl">{preview.icon || '🐉'}</div>
            <h4 className="mb-2 px-2 text-2xl font-bold leading-tight text-[#5c3a21] md:text-3xl">{preview.title}</h4>
            <p className="mb-6 rounded border border-[#c2b08f] bg-[#d9c4a1] px-4 py-2 text-sm font-medium italic text-[#7c5030] shadow-inner md:text-base">“{preview.description}”</p>
            <div className="mb-6 rounded-xl border border-[#5c3a21]/20 bg-black/10 p-3"><div className="mb-2 text-xs font-black uppercase tracking-widest text-[#5c3a21]">🏆 ของรางวัลที่คาดหวัง 🏆</div><div className="flex items-center justify-center gap-4"><span className="rounded-full bg-yellow-100 px-3 py-1 font-bold text-yellow-700 shadow-sm">⭐ +XP</span><span className="rounded-full bg-green-100 px-3 py-1 font-bold text-green-700 shadow-sm">🎓 ความรู้</span></div></div>
            <button type="button" aria-label="บุกโจมตี!" onClick={() => { const lessonId = preview.id; setPreview(null); onSelectLesson(lessonId) }} className="flex w-full items-center justify-center gap-2 rounded-xl border-b-4 border-red-900 bg-gradient-to-b from-red-500 to-red-700 py-4 text-2xl font-black text-white shadow-[0_5px_15px_rgba(220,38,38,0.5)] transition-all active:translate-y-1 active:border-b-0">⚔️ บุกโจมตี!</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
