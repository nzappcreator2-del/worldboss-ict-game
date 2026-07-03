import { useCallback, useEffect, useState } from 'react'
import { QuizQuestionView, type QuizQuestion } from './QuizQuestionView'

export type { QuizQuestion } from './QuizQuestionView'

type LessonSummary = { id: string; title: string }
type QuestionResult = { success: boolean; data?: QuizQuestion[]; error?: string }
export type PretestService = { loadQuestions(lessonId: string): Promise<QuestionResult> }

type Props = {
  service: PretestService
  onBack(): void
  onContinue(): void
}

export function PretestPage({ service, onBack, onContinue }: Props) {
  const [lesson, setLesson] = useState<LessonSummary | null>(null)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'done' | 'error'>('idle')

  const load = useCallback(async (target: LessonSummary) => {
    setLesson(target)
    setStatus('loading')
    setQuestions([])
    setIndex(0)
    setScore(0)
    try {
      const result = await service.loadQuestions(target.id)
      if (!result.success) throw new Error(result.error || 'load failed')
      const data = result.data || []
      if (data.length === 0) {
        onContinue()
        return
      }
      setQuestions(data)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [onContinue, service])

  useEffect(() => {
    const start = (event: Event) => {
      const target = (event as CustomEvent<LessonSummary>).detail
      if (target?.id) void load(target)
    }
    window.addEventListener('nextgen:start-pretest', start)
    return () => window.removeEventListener('nextgen:start-pretest', start)
  }, [load])

  const answer = (correct: boolean) => {
    const nextScore = score + (correct ? 1 : 0)
    const nextIndex = index + 1
    setScore(nextScore)
    if (nextIndex >= questions.length) setStatus('done')
    else setIndex(nextIndex)
  }

  if (!lesson) return <section id="page-pretest" className="hidden" />

  return (
    <section id="page-pretest" className="flex-1 flex flex-col relative z-20 pt-4">
      <div className="flex items-center justify-between mb-6 gap-2">
        <button type="button" onClick={onBack} className="btn-action text-blue-800 font-black bg-blue-100 px-5 py-2.5 rounded-xl">← ถอยทัพ</button>
        <h2 className="rpg-title text-3xl">📝 Pre-test: {lesson.title}</h2>
      </div>
      {status === 'loading' && <div className="rpg-box rpg-box-blue p-8 text-center font-bold">กำลังโหลดคำถาม...</div>}
      {status === 'error' && <div className="rpg-box rpg-box-blue p-8 text-center"><p className="font-bold text-red-600 mb-4">โหลด Pre-test ไม่สำเร็จ</p><button type="button" onClick={() => void load(lesson)} className="btn-action px-6 py-2 bg-blue-600 text-white rounded-xl">ลองใหม่</button></div>}
      {status === 'ready' && questions[index] && (
        <div className="rpg-box rpg-box-blue p-6 md:p-8 mb-6 flex-1 flex flex-col">
          <div className="flex justify-between items-center mb-4"><div className="text-sm font-bold bg-gray-100 px-3 py-1 rounded-full">คำถามที่ <span className="text-blue-600 text-lg">{index + 1}</span>/{questions.length}</div><div className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">📝 แบบทดสอบก่อนเรียน</div></div>
          <h3 className="text-xl md:text-2xl font-bold text-gray-800 mb-4 leading-relaxed">{questions[index].text}</h3>
          {questions[index].image && <img src={questions[index].image} alt="ภาพประกอบคำถาม" className="max-h-80 mx-auto mb-6 rounded-2xl border-4 border-blue-100 object-contain" />}
          <QuizQuestionView question={questions[index]} onAnswer={answer} />
        </div>
      )}
      {status === 'done' && <div className="rpg-box rpg-box-blue p-8 shadow-xl text-center"><div className="text-6xl mb-4">📊</div><h3 className="rpg-title text-3xl mb-2">สรุปผล Pre-test</h3><p className="text-xl text-indigo-700 font-black mb-4">คะแนน: {score}/{questions.length}</p><p className="text-gray-600 font-bold mb-6">มาดูเนื้อหาเพื่อเตรียมตัวสำหรับ Boss Battle กันเถอะ!</p><button type="button" onClick={onContinue} className="btn-arcade w-full max-w-sm mx-auto py-4 text-xl">📖 ไปดูเนื้อหาเลย</button></div>}
    </section>
  )
}
