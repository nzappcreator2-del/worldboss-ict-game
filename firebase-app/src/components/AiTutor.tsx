import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

export type AiTutorUser = { name?: string; avatar?: string }
export type AiTutorResponse = { success: boolean; answer?: string; error?: string }
export type AiTutorService = {
  getCurrentUser(): AiTutorUser | null
  getCurrentLessonTitle(): string
  ask(question: string, context: string): Promise<AiTutorResponse>
}

type Message = { id: number; role: 'assistant' | 'user'; text: string }

const greeting = 'สวัสดีผู้กล้า! ผมคือ AI พิทักษ์ความรู้ 🤖 มีอะไรให้ผมรับใช้รึเปล่า?'

function formattedText(text: string): ReactNode {
  return text.split('\n').map((line, lineIndex) => (
    <Fragment key={`${lineIndex}-${line}`}>
      {line.split(/(\*\*.*?\*\*|\*.*?\*)/g).filter(Boolean).map((part, partIndex) => {
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={partIndex}>{part.slice(2, -2)}</strong>
        if (part.startsWith('*') && part.endsWith('*')) return <em key={partIndex}>{part.slice(1, -1)}</em>
        return <Fragment key={partIndex}>{part}</Fragment>
      })}
      {lineIndex < text.split('\n').length - 1 && <br />}
    </Fragment>
  ))
}

export function AiTutor({ service }: { service: AiTutorService }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<Message[]>([{ id: 1, role: 'assistant', text: greeting }])
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const inputRef = useRef<HTMLInputElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(2)
  const dragRef = useRef({ pointerId: -1, startX: 0, startY: 0, originX: 0, originY: 0, moved: false })

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (open && chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages, loading, open])

  const submit = async () => {
    const question = input.trim()
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
      setMessages((current) => [...current, { id: nextId.current++, role: 'assistant', text }])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setMessages((current) => [...current, { id: nextId.current++, role: 'assistant', text: `⚠️ การเชื่อมต่อขาดหาย! (${message})` }])
    } finally {
      setLoading(false)
    }
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
          className="fixed bottom-24 right-6 w-[350px] max-w-[calc(100vw-3rem)] h-[450px] max-h-[60vh] bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl shadow-2xl z-[60] flex flex-col overflow-hidden"
        >
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-4 text-white flex justify-between items-center shadow-md relative overflow-hidden">
            <div className="absolute -right-4 -top-4 opacity-20 text-6xl">✨</div>
            <div className="flex items-center gap-3 relative z-10">
              <div className="text-3xl bg-white/20 rounded-full w-10 h-10 flex items-center justify-center border border-white/30">🤖</div>
              <div>
                <h3 className="font-bold text-lg leading-tight">ผู้พิทักษ์ความรู้</h3>
                <p className="text-xs text-indigo-100 font-medium tracking-wide">AI Tutor พร้อมให้คำปรึกษา</p>
              </div>
            </div>
            <button type="button" aria-label="ปิด AI Tutor" onClick={() => setOpen(false)} className="text-white/80 hover:text-white text-2xl relative z-10 w-8 h-8 bg-black/10 rounded-full">×</button>
          </div>

          <div ref={chatRef} className="flex-1 p-4 overflow-y-auto flex flex-col gap-2 bg-gradient-to-b from-indigo-50/50 to-purple-50/30 shadow-inner border-y border-white/50">
            {messages.map((message) => (
              <div key={message.id} className={`flex gap-3 mb-2 max-w-[85%] ${message.role === 'user' ? 'self-end ml-auto flex-row-reverse' : 'self-start mr-auto'}`}>
                <div className="text-3xl drop-shadow-md flex-shrink-0">{message.role === 'user' ? user?.avatar || '👤' : '🤖'}</div>
                <div className={message.role === 'user'
                  ? 'bg-amber-100 text-amber-900 border border-amber-300 px-4 py-2 rounded-2xl rounded-tr-none shadow-sm font-medium text-sm'
                  : 'bg-white/90 text-indigo-900 border-2 border-indigo-200 px-4 py-2 rounded-2xl rounded-tl-none shadow-sm font-medium text-sm leading-relaxed'}>
                  {message.role === 'assistant' ? formattedText(message.text) : message.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3 mb-2 max-w-[85%] self-start mr-auto">
                <div className="text-3xl">🤖</div>
                <div className="bg-white text-indigo-900 border-2 border-indigo-200 px-4 py-2 rounded-2xl rounded-tl-none text-sm animate-pulse">กำลังร่ายมนต์หาคำตอบ...</div>
              </div>
            )}
          </div>

          <div className="p-4 bg-white/80 backdrop-blur-md border-t border-indigo-100 flex gap-2">
            <input ref={inputRef} value={input} disabled={loading} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown} placeholder="ถามข้ามาได้เลย..." className="flex-1 min-w-0 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium text-gray-700" />
            <button type="button" aria-label="ส่งคำถาม" disabled={loading} onClick={() => void submit()} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white w-10 h-10 rounded-xl flex items-center justify-center shadow-md">
              <span className="-rotate-45 ml-1 mb-1 text-lg">🚀</span>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
