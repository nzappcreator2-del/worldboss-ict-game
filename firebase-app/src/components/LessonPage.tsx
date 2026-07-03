import { useCallback, useEffect, useState } from 'react'
import { toLessonEmbedUrl } from './lessonMedia'

export type Lesson = {
  id: string
  title: string
  description?: string
  content?: string
  videoUrl?: string
  icon?: string
  enablePretest?: boolean
  worksheetUrl?: string
}

export type LessonService = {
  getCurrentLesson(): Lesson | null
}

type Props = {
  service: LessonService
  onBack(): void
  onStartQuiz(): void
  onOpenWorksheet(): void
}

export function LessonPage({ service, onBack, onStartQuiz, onOpenWorksheet }: Props) {
  const [lesson, setLesson] = useState<Lesson | null>(null)

  const open = useCallback(() => setLesson(service.getCurrentLesson()), [service])

  useEffect(() => {
    window.addEventListener('nextgen:open-lesson', open)
    return () => window.removeEventListener('nextgen:open-lesson', open)
  }, [open])

  if (!lesson) return <section id="page-lesson" className="hidden" />

  const embedUrl = toLessonEmbedUrl(lesson.videoUrl)

  return (
    <section id="page-lesson" className="flex-1 flex flex-col relative z-20 p-4 md:p-8 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-6 gap-2">
        <button type="button" onClick={onBack} className="btn-action text-blue-800 font-black flex items-center gap-1 bg-blue-100 hover:bg-blue-200 px-5 py-2.5 rounded-xl shadow-sm transition">
          <span className="text-lg">←</span> ถอยทัพ
        </button>
        <h2 className="rpg-title text-3xl text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{lesson.title}</h2>
      </div>

      <div className="rpg-box bg-white/80 backdrop-blur-md border-[3px] border-white/40 p-6 md:p-8 mb-6 text-center flex-1 flex flex-col shadow-2xl rounded-3xl">
        <p className="text-gray-800 mb-4 text-lg font-bold drop-shadow-sm">{lesson.description || ''}</p>

        {lesson.content?.trim() && (
          <div className="text-gray-800 text-left text-base leading-relaxed mb-6 whitespace-pre-wrap bg-white/60 p-5 rounded-2xl shadow-inner border border-green-200 backdrop-blur-sm">
            {lesson.content}
          </div>
        )}

        <div className="w-full aspect-video bg-gray-900 rounded-2xl overflow-hidden shadow-2xl mb-8 relative flex items-center justify-center border-4 border-gray-800">
          <iframe
            id="lesson-video-frame"
            className={`w-full h-full ${embedUrl ? '' : 'hidden'}`}
            src={embedUrl || undefined}
            title={`วิดีโอบทเรียน ${lesson.title}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
          {!embedUrl && (
            <span className="text-gray-400 font-semibold flex flex-col items-center gap-2">
              <span className="text-4xl">🎬</span>
              ไม่มีวิดีโอสำหรับด่านนี้
            </span>
          )}
        </div>

        <div className="mt-auto flex flex-col sm:flex-row gap-4 justify-center items-center w-full">
          <button type="button" onClick={onOpenWorksheet} className="w-full sm:w-auto btn-action bg-blue-500 hover:bg-blue-600 text-white font-black py-4 px-8 rounded-xl text-xl shadow-md">
            <span className="relative z-10 flex items-center justify-center gap-2 drop-shadow-md">📝 เปิดทำใบงาน</span>
          </button>
          <button type="button" onClick={onStartQuiz} className="w-full sm:w-auto btn-arcade py-4 px-10 text-xl animate-pulse">
            <span className="relative z-10 flex items-center justify-center gap-2 text-2xl drop-shadow-md">⚔️ เข้าปะทะบอส (ทำทดสอบ)</span>
          </button>
        </div>
      </div>
    </section>
  )
}
