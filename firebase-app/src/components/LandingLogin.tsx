import { useEffect, useMemo, useState, type FormEvent } from 'react'
import studentHeroMale from '../assets/generated/student-hero-male.jpg'
import studentHeroFemale from '../assets/generated/student-hero-female.jpg'

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
export type StudentGender = 'male' | 'female'
export type LandingService = {
  getInitialData(): Promise<LandingData>
  loginStudent(name: string, className: string, avatar: string, gender?: StudentGender): Promise<LoginResult>
}

type Props = {
  service: LandingService
  onLogin(user: LandingUser, initialData: LandingData): void
  onAdmin(): void
}

const heroChoices: { gender: StudentGender; emoji: string; name: string; tagline: string; art: string }[] = [
  { gender: 'male', emoji: '👦', name: 'นักเรียนชาย', tagline: 'สายลุย พร้อมบุกทุกด่านความรู้', art: studentHeroMale },
  { gender: 'female', emoji: '👧', name: 'นักเรียนหญิง', tagline: 'สายไว ปราดเปรียวทุกสนามประลอง', art: studentHeroFemale },
]

const heroAvatarEmoji: Record<StudentGender, string> = { male: '👦', female: '👧' }

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
  const [avatar, setAvatar] = useState('')
  const [gender, setGender] = useState<StudentGender | null>(null)
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
    () => {
      const seen = new Set<string>()
      return initialData.users.filter((user) => {
        if (user.class !== className) return false
        const identity = `${user.class}\u0000${user.name}`
        if (seen.has(identity)) return false
        seen.add(identity)
        return true
      })
    },
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

  const registering = selectedName === 'NEW_PLAYER'
  const returningPlayer = Boolean(selectedName) && !registering

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const name = registering ? newName.trim() : selectedName
    if (!studentClass || !name) {
      setError('กรุณาเลือกระดับชั้นและระบุชื่อผู้กล้า')
      return
    }
    if (registering && !gender) {
      setError('กรุณาเลือกตัวละครของคุณก่อนออกผจญภัย')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      // New heroes register with their chosen body; returning players keep the
      // character they already have (gender is immutable server-side).
      const result = registering && gender
        ? await service.loginStudent(name, className, heroAvatarEmoji[gender], gender)
        : await service.loginStudent(name, className, avatar || '🧙‍♂️')
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
    <section id="page-landing" className="adventure-landing page-active">
      <div data-testid="landing-background" className="adventure-background" aria-hidden="true" />
      <div className="adventure-vignette" aria-hidden="true" />

      <form className="adventure-stage" onSubmit={submit}>
        <div data-testid="mobile-brand" className="adventure-mobile-brand" aria-hidden="true">
          <strong>NextGen Play</strong>
          <span>LMS + Gamification</span>
        </div>

        <div className="adventure-fields">
          <div className="adventure-field-panel">
            <span className="field-emblem" aria-hidden="true">🎓</span>
            <label htmlFor="react-student-class">ระดับชั้นเรียน</label>
            <select
              id="react-student-class"
              aria-label="ระดับชั้นเรียน"
              required
              value={studentClass}
              onChange={(event) => { setStudentClass(event.target.value); setRoom(''); resetStudent() }}
            >
              <option value="" disabled>เลือกระดับชั้นเรียนก่อน...</option>
              {classes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>

          {rooms.length > 0 && (
            <div className="adventure-field-panel">
              <span className="field-emblem" aria-hidden="true">🚪</span>
              <label htmlFor="react-student-room">ห้องเรียน</label>
              <select
                id="react-student-room"
                aria-label="ห้องเรียน"
                value={room}
                onChange={(event) => { setRoom(event.target.value); resetStudent() }}
              >
                <option value="">ทุกห้อง</option>
                {rooms.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          )}

          <div className="adventure-field-panel">
            <span className="field-emblem" aria-hidden="true">📜</span>
            <label htmlFor="react-student-name">รายชื่อผู้กล้า</label>
            <select
              id="react-student-name"
              aria-label="รายชื่อผู้กล้า"
              required
              disabled={!studentClass || loading}
              value={selectedName}
              onChange={(event) => selectRegisteredName(event.target.value)}
            >
              <option value="" disabled>{loading ? 'กำลังโหลดรายชื่อ...' : 'เลือกรายชื่อผู้กล้า...'}</option>
              <option value="NEW_PLAYER">➕ ลงทะเบียนผู้เล่นใหม่</option>
              {registeredUsers.map((user) => <option key={`${user.class}-${user.name}`} value={user.name}>{user.avatar || '👤'} {user.name}</option>)}
            </select>
          </div>

          {selectedName === 'NEW_PLAYER' && (
            <div className="adventure-field-panel adventure-new-player">
              <span className="field-emblem" aria-hidden="true">✒️</span>
              <label htmlFor="react-new-name">ชื่อผู้กล้าคนใหม่</label>
              <input
                id="react-new-name"
                aria-label="ชื่อผู้กล้าคนใหม่"
                required
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="ใส่ชื่อของคุณที่นี่..."
              />
            </div>
          )}
        </div>

        <div className="adventure-chooser">
          <h1><span aria-hidden="true">◆</span> เลือกตัวละครผู้กล้า <span aria-hidden="true">◆</span></h1>
          <div className={`adventure-heroes ${returningPlayer ? 'locked' : ''}`}>
            {heroChoices.map((choice) => (
              <button
                key={choice.gender}
                type="button"
                aria-label={`เลือกตัวละคร ${choice.name}`}
                aria-pressed={gender === choice.gender}
                disabled={returningPlayer}
                onClick={() => { setGender(choice.gender); setError('') }}
                className={`adventure-hero ${choice.gender} ${gender === choice.gender ? 'selected' : ''}`}
              >
                <span className="hero-stage">
                  <img className="hero-portrait-backdrop" src={choice.art} alt="" draggable={false} />
                  <span className="hero-stage-glow" aria-hidden="true" />
                  <img className="hero-portrait" src={choice.art} alt={`ภาพตัวละคร${choice.name}แบบสามมิติ`} draggable={false} />
                  <span className="hero-selected-badge">✓ เลือกแล้ว</span>
                </span>
                <span className="hero-nameplate">
                  <strong><span aria-hidden="true">{choice.emoji}</span> {choice.name}</strong>
                  <small>{choice.tagline}</small>
                </span>
              </button>
            ))}
          </div>
          <p className="adventure-chooser-note">
            {returningPlayer
              ? '✨ ผู้เล่นเดิมจะได้ตัวละครเดิมที่เลือกไว้ตอนสมัครสมาชิก'
              : '🎮 ตัวละครของคุณจะเดิน ต่อสู้ และแต่งตัวได้จริงในเกม'}
          </p>
        </div>

        {error && <p role="alert" className="adventure-error">{error}</p>}

        <div className="adventure-actions">
          <button type="submit" disabled={submitting} className="adventure-start">
            <span aria-hidden="true">✦</span>
            {submitting ? 'กำลังเข้าสู่ระบบ...' : 'เริ่มการผจญภัย'}
          </button>
          <button type="button" onClick={onAdmin} className="adventure-admin">
            <span aria-hidden="true">🛡️</span>
            <span>สำหรับครูผู้ดูแลระบบ<br /><small>(Admin Panel)</small></span>
          </button>
        </div>

        <footer className="adventure-footer">
          <span>◉ By Kru_Veerapat Jitphapan</span>
          <a href="https://www.facebook.com/chayphat.sk" target="_blank" rel="noopener noreferrer">🔵 Facebook</a>
          <a href="tel:0887842314">🟢 088-7842314</a>
          <a href="https://line.me/ti/p/hkwcKeUa-g" target="_blank" rel="noopener noreferrer">🟢 Line</a>
        </footer>
      </form>
    </section>
  )
}
