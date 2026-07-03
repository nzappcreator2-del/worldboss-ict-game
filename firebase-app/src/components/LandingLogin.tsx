import { useEffect, useMemo, useState, type FormEvent } from 'react'

export type RegisteredUser = { name: string; class: string; avatar?: string }
export type LandingUser = {
  id: string
  name: string
  class: string
  avatar?: string
  xp?: number
  level?: number
  [key: string]: unknown
}
export type LandingData = {
  success: boolean
  users: RegisteredUser[]
  settings: Record<string, unknown>
  news: Array<Record<string, unknown>>
  error?: string
}
export type LoginResult = { success: boolean; user?: LandingUser; error?: string }
export type LandingService = {
  getInitialData(): Promise<LandingData>
  loginStudent(name: string, className: string, avatar: string): Promise<LoginResult>
}

type Props = {
  service: LandingService
  onLogin(user: LandingUser, initialData: LandingData): void
  onAdmin(): void
}

const avatars = [
  { emoji: '🧙‍♂️', name: 'จอมเวทย์', theme: 'mage', text: 'text-blue-800' },
  { emoji: '🧝‍♀️', name: 'เอลฟ์', theme: 'elf', text: 'text-green-800' },
  { emoji: '⚔️', name: 'นักรบ', theme: 'warrior', text: 'text-red-800' },
]

const splitSetting = (value: unknown, fallback: string[] = []) => typeof value === 'string'
  ? value.split(',').map((item) => item.trim()).filter(Boolean)
  : fallback

const friendlyError = (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason)
  if (message.includes('auth/admin-restricted-operation')) {
    return 'ยังไม่ได้เปิด Anonymous Authentication ใน Firebase Console กรุณาเปิดใช้งานก่อนเข้าสู่ระบบ'
  }
  if (message.includes('auth/network-request-failed')) {
    return 'เชื่อมต่อ Firebase ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง'
  }
  return message
}

export function LandingLogin({ service, onLogin, onAdmin }: Props) {
  const [initialData, setInitialData] = useState<LandingData>({ success: true, users: [], settings: {}, news: [] })
  const [studentClass, setStudentClass] = useState('')
  const [room, setRoom] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [newName, setNewName] = useState('')
  const [avatar, setAvatar] = useState('🧙‍♂️')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    service.getInitialData().then((result) => {
      if (!active) return
      if (result.success) setInitialData(result)
      else setError(result.error || 'ไม่สามารถโหลดข้อมูลเริ่มต้นได้')
    }).catch((reason: unknown) => {
      if (active) setError(friendlyError(reason))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [service])

  const classes = splitSetting(initialData.settings.Classes, ['ป.4', 'ป.5', 'ป.6'])
  const rooms = splitSetting(initialData.settings.Rooms)
  const className = studentClass && room ? `${studentClass}/${room}` : studentClass
  const registeredUsers = useMemo(
    () => initialData.users.filter((user) => user.class === className),
    [className, initialData.users],
  )

  const resetStudent = () => {
    setSelectedName('')
    setNewName('')
  }

  const selectRegisteredName = (name: string) => {
    setSelectedName(name)
    const user = registeredUsers.find((item) => item.name === name)
    if (user?.avatar) setAvatar(user.avatar)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const name = selectedName === 'NEW_PLAYER' ? newName.trim() : selectedName
    if (!studentClass || !name) {
      setError('กรุณาเลือกระดับชั้นและระบุชื่อผู้กล้า')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const result = await service.loginStudent(name, className, avatar)
      if (!result.success || !result.user) {
        setError(result.error || 'เข้าสู่ระบบไม่สำเร็จ')
        return
      }
      onLogin(result.user, initialData)
    } catch (reason) {
      setError(friendlyError(reason))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section id="page-landing" className="flex-1 flex flex-col items-center justify-start page-active relative overflow-y-auto overflow-x-hidden">
      <div className="absolute inset-0 pointer-events-none flex justify-between items-start px-10 pt-10 opacity-40">
        <div className="text-6xl animate-bounce" style={{ animationDuration: '4s' }}>☁️</div>
        <div className="text-7xl animate-bounce" style={{ animationDuration: '6s', transform: 'scaleX(-1)' }}>☁️</div>
      </div>

      <div className="quest-board quest-board-inner p-6 md:p-8 w-full max-w-md text-center transform transition-all duration-500 hover:scale-[1.02] mt-16 z-10 shrink-0">
        <div className="absolute -top-16 left-1/2 transform -translate-x-1/2">
          <div className="bg-gradient-to-b from-yellow-300 to-yellow-500 border-4 border-yellow-700 rounded-full p-2 shadow-[0_5px_15px_rgba(0,0,0,0.3)] animate-pulse relative">
            <img src="https://cdn-icons-png.flaticon.com/512/3206/3206037.png" alt="Logo" className="w-20 h-20 animate-bounce" />
          </div>
        </div>

        <h1 className="rpg-title text-4xl mt-6 mb-3">NextGen Play</h1>
        <p className="text-orange-900 bg-orange-100/90 inline-block px-4 py-1.5 rounded-full mb-6 font-bold border-2 border-orange-300 text-sm shadow-sm tracking-wide">
          ✨ LMS+Gamification สำหรับการเรียนรู้ยุคใหม่ ✨
        </p>

        <form className="space-y-4 text-left" onSubmit={submit}>
          <div>
            <label htmlFor="react-student-class" className="block text-sm font-black text-amber-900 mb-2 drop-shadow-sm">1. 📚 ระดับชั้นเรียน</label>
            <select
              id="react-student-class"
              aria-label="ระดับชั้นเรียน"
              required
              value={studentClass}
              onChange={(event) => { setStudentClass(event.target.value); setRoom(''); resetStudent() }}
              className="game-input w-full px-4 py-3 cursor-pointer"
            >
              <option value="" disabled>เลือกระดับชั้นเรียนก่อน...</option>
              {classes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>

          {rooms.length > 0 && (
            <div className="animate-fadeIn">
              <label htmlFor="react-student-room" className="block text-sm font-black text-amber-900 mb-2 drop-shadow-sm">🚪 ห้องเรียน</label>
              <select
                id="react-student-room"
                aria-label="ห้องเรียน"
                value={room}
                onChange={(event) => { setRoom(event.target.value); resetStudent() }}
                className="game-input w-full px-4 py-3 cursor-pointer"
              >
                <option value="">ทุกห้อง</option>
                {rooms.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="react-student-name" className="block text-sm font-black text-amber-900 mb-2 drop-shadow-sm">2. 👤 รายชื่อผู้กล้า</label>
            <select
              id="react-student-name"
              aria-label="รายชื่อผู้กล้า"
              required
              disabled={!studentClass || loading}
              value={selectedName}
              onChange={(event) => selectRegisteredName(event.target.value)}
              className="game-input w-full px-4 py-3 cursor-pointer disabled:opacity-60 disabled:bg-gray-200"
            >
              <option value="" disabled>{loading ? 'กำลังโหลดรายชื่อ...' : 'เลือกรายชื่อผู้กล้า...'}</option>
              <option value="NEW_PLAYER">➕ ลงทะเบียนผู้เล่นใหม่</option>
              {registeredUsers.map((user) => <option key={`${user.class}-${user.name}`} value={user.name}>{user.avatar || '👤'} {user.name}</option>)}
            </select>
          </div>

          {selectedName === 'NEW_PLAYER' && (
            <div className="animate-fadeIn">
              <label htmlFor="react-new-name" className="block text-sm font-black text-amber-900 mb-2 drop-shadow-sm">✒️ ชื่อผู้กล้าคนใหม่</label>
              <input
                id="react-new-name"
                aria-label="ชื่อผู้กล้าคนใหม่"
                required
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="ใส่ชื่อของคุณที่นี่..."
                className="game-input w-full px-4 py-3"
              />
            </div>
          )}

          <div>
            <span className="block text-sm font-black text-amber-900 mb-2 mt-2 drop-shadow-sm">3. ⚔️ เลือกคู่หูผจญภัย</span>
            <div className="flex justify-between gap-3">
              {avatars.map((item) => (
                <button
                  key={item.emoji}
                  type="button"
                  aria-pressed={avatar === item.emoji}
                  onClick={() => setAvatar(item.emoji)}
                  className={`avatar-option avatar-btn ${item.theme} flex-1 text-center py-3 ${avatar === item.emoji ? 'selected ring-2 ring-blue-500' : ''}`}
                >
                  <span className="block text-4xl mb-1 drop-shadow-md relative z-10">{item.emoji}</span>
                  <span className={`block text-[11px] font-black tracking-wide z-10 relative ${item.text}`}>{item.name}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <p role="alert" className="rounded-xl bg-red-100 border border-red-300 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-arcade w-full py-4 mt-6 text-xl disabled:opacity-60">
            {submitting ? '⏳ กำลังเข้าสู่ระบบ...' : '▶ เริ่มการผจญภัย'}
          </button>
        </form>
      </div>

      <div className="mt-4 mb-6 text-center z-10 relative flex flex-col items-center shrink-0">
        <button
          type="button"
          onClick={onAdmin}
          className="mb-4 text-sm text-indigo-900 bg-indigo-100 hover:bg-indigo-200 font-black px-6 py-2.5 rounded-full border-2 border-indigo-300 shadow-[0_4px_10px_rgba(79,70,229,0.2)] inline-flex items-center gap-2"
        >
          <span className="text-lg">🛡️</span> สำหรับครูผู้ดูแลระบบ (Admin Panel)
        </button>
        <div className="glass-card px-5 py-3 rounded-2xl border-2 border-white/80 inline-flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
          <span className="text-xs font-black text-gray-800">🧑‍💻 By Kru_Veeraphat Jitphapan</span>
          <span className="flex items-center gap-3 text-xs font-bold">
            <a href="https://www.facebook.com/chayphat.sk" target="_blank" rel="noopener noreferrer">Facebook</a>
            <a href="tel:0887842314">088-7842314</a>
            <a href="https://line.me/ti/p/hkwcKeUa-g" target="_blank" rel="noopener noreferrer">Line</a>
          </span>
        </div>
      </div>
    </section>
  )
}
