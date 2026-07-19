import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { MarkdownLite } from './MarkdownLite'

export type AiTutorUser = { name?: string; avatar?: string }
export type AiTutorResponse = { success: boolean; answer?: string; error?: string; mode?: string }
export type AiTutorService = {
  getCurrentUser(): AiTutorUser | null
  getCurrentLessonTitle(): string
  ask(question: string, context: string): Promise<AiTutorResponse>
  reset?(): void
}

type Message = { id: number; role: 'assistant' | 'user'; text: string }

const greeting = 'สวัสดีผู้กล้า! ผมคือ AI พิทักษ์ความรู้ 🤖 มีอะไรให้ผมรับใช้รึเปล่า?'

const quickQuestions = [
  'สรุปบทเรียนด่านนี้ให้หน่อย',
  'ขอเทคนิคช่วยจำแบบง่าย ๆ',
  'ขอข้อซ้อมมือ 1 ข้อ',
]

export function AiTutor({ service }: { service: AiTutorService }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [fallbackMode, setFallbackMode] = useState(false)
  const [messages, setMessages] = useState<Message[]>([{ id: 1, role: 'assistant', text: greeting }])
  const inputRef = useRef<HTMLInputElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(2)
  const dragRef = useRef({ pointerId: -1, startX: 0, startY: 0, originX: 0, originY: 0, moved: false })
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (open && chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages, loading, open])

  const submit = async (raw?: string) => {
    const question = (raw ?? input).trim()
    if (!question || loading) return
    const user = service.getCurrentUser()
    const context = `ชื่อผู้เล่น: ${user?.name || 'ไม่ระบุนาม'}, ด่านปัจจุบันที่กำลังผจญภัย: ${service.getCurrentLessonTitle() || 'ไม่มีข้อมูลด่าน'}`
    setInput('')
    setMessages((current) => [...current, { id: nextId.current++, role: 'user', text: question }])
    setLoading(true)
    try {
      const result = await service.ask(question, context)
      const text = result.success
        ? result.answer || 'ยังไม่มีคำตอบสำหรับคำถามนี้'
        : `⚠️ โอ๊ะโอ! ระบบขัดข้อง: ${result.error || 'ไม่ทราบสาเหตุ'}`
      if (result.success) setFallbackMode(result.mode === 'local-fallback')
      setMessages((current) => [...current, { id: nextId.current++, role: 'assistant', text }])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setMessages((current) => [...current, { id: nextId.current++, role: 'assistant', text: `⚠️ การเชื่อมต่อขาดหาย! (${message})` }])
    } finally {
      setLoading(false)
    }
  }

  const resetConversation = () => {
    if (loading) return
    service.reset?.()
    setMessages([{ id: nextId.current++, role: 'assistant', text: greeting }])
    inputRef.current?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void submit()
    }
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) drag.moved = true
    setPosition({ x: drag.originX + dx, y: drag.originY + dy })
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current.pointerId === event.pointerId) dragRef.current.pointerId = -1
  }

  const user = service.getCurrentUser()
  const showSuggestions = messages.length === 1 && !loading

  return (
    <>
      <button
        type="button"
        aria-label="เปิด AI Tutor"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={() => {
          if (dragRef.current.moved) {
            dragRef.current.moved = false
            return
          }
          setOpen(true)
        }}
        className="fixed top-1/2 right-4 -mt-8 md:top-auto md:mt-0 md:bottom-6 md:right-6 w-16 h-16 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-full shadow-[0_0_20px_rgba(99,102,241,0.6)] flex items-center justify-center text-4xl z-[60] cursor-grab active:cursor-grabbing border-4 border-white/40 touch-none"
        style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)`, userSelect: 'none' }}
      >
        <span className="w-full h-full flex items-center justify-center rounded-full hover:scale-110 hover:rotate-12 transition-transform animate-bounce pointer-events-none drop-shadow-md">
          🤖
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse shadow-sm border-2 border-white">AI</span>
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="ผู้พิทักษ์ความรู้"
          className="fixed bottom-24 right-6 w-[370px] max-w-[calc(100vw-3rem)] h-[500px] max-h-[65vh] bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl shadow-2xl z-[60] flex flex-col overflow-hidden"
        >
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-4 text-white flex justify-between items-center shadow-md relative overflow-hidden">
            <div className="absolute -right-4 -top-4 opacity-20 text-6xl">✨</div>
            <div className="flex items-center gap-3 relative z-10 min-w-0">
              <div className="text-3xl bg-white/20 rounded-full w-10 h-10 flex items-center justify-center border border-white/30 shrink-0">🤖</div>
              <div className="min-w-0">
                <h3 className="font-bold text-lg leading-tight truncate">ผู้พิทักษ์ความรู้</h3>
                <p className="text-xs text-indigo-100 font-medium tracking-wide flex items-center gap-1.5">
                  AI Tutor พร้อมให้คำปรึกษา
                  {fallbackMode && <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-bold text-amber-950">โหมดพื้นฐาน</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 relative z-10 shrink-0">
              <button type="button" aria-label="เริ่มบทสนทนาใหม่" title="เริ่มบทสนทนาใหม่" onClick={resetConversation} className="text-white/80 hover:text-white text-lg w-8 h-8 bg-black/10 rounded-full">↺</button>
              <button type="button" aria-label="ปิด AI Tutor" onClick={() => setOpen(false)} className="text-white/80 hover:text-white text-2xl w-8 h-8 bg-black/10 rounded-full">×</button>
            </div>
          </div>

          <div ref={chatRef} className="flex-1 p-4 overflow-y-auto flex flex-col gap-2 bg-gradient-to-b from-indigo-50/50 to-purple-50/30 shadow-inner border-y border-white/50">
            {messages.map((message) => (
              <div key={message.id} className={`flex gap-3 mb-2 max-w-[85%] ${message.role === 'user' ? 'self-end ml-auto flex-row-reverse' : 'self-start mr-auto'}`}>
                <div className="text-3xl drop-shadow-md flex-shrink-0">{message.role === 'user' ? user?.avatar || '👤' : '🤖'}</div>
                <div className={message.role === 'user'
                  ? 'bg-amber-100 text-amber-900 border border-amber-300 px-4 py-2 rounded-2xl rounded-tr-none shadow-sm font-medium text-sm'
                  : 'bg-white/90 text-indigo-900 border-2 border-indigo-200 px-4 py-2 rounded-2xl rounded-tl-none shadow-sm font-medium text-sm leading-relaxed'}>
                  {message.role === 'assistant' ? <MarkdownLite text={message.text} /> : message.text}
                </div>
              </div>
            ))}
            {showSuggestions && (
              <div className="mt-1 flex flex-wrap gap-2 pl-11">
                {quickQuestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => void submit(question)}
                    className="rounded-full border border-indigo-300 bg-white/80 px-3 py-1.5 text-xs font-bold text-indigo-700 shadow-sm hover:bg-indigo-50 hover:border-indigo-400 transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}
            {loading && (
              <div className="flex gap-3 mb-2 max-w-[85%] self-start mr-auto">
                <div className="text-3xl">🤖</div>
                <div className="bg-white text-indigo-900 border-2 border-indigo-200 px-4 py-2 rounded-2xl rounded-tl-none text-sm animate-pulse">กำลังร่ายมนต์หาคำตอบ...</div>
              </div>
            )}
          </div>

          <div className="p-3 bg-white/80 backdrop-blur-md border-t border-indigo-100">
            <div className="flex gap-2">
              <input ref={inputRef} value={input} disabled={loading} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown} placeholder="ถามข้ามาได้เลย..." className="flex-1 min-w-0 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium text-gray-700" />
              <button type="button" aria-label="ส่งคำถาม" disabled={loading} onClick={() => void submit()} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white w-10 h-10 rounded-xl flex items-center justify-center shadow-md">
                <span className="-rotate-45 ml-1 mb-1 text-lg">🚀</span>
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-slate-400">AI อาจตอบคลาดเคลื่อนได้ ถ้าไม่แน่ใจให้ถามคุณครูอีกครั้งนะ</p>
          </div>
        </div>
      )}
    </>
  )
}
