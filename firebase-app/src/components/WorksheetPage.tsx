import { useCallback, useEffect, useRef, useState } from 'react'
import { createWorksheetDownload, drawWorksheetCanvas, type WorksheetUser } from './worksheetCanvas'

export type WorksheetLesson = { id: string; title: string; content?: string; worksheetUrl?: string }
export type WorksheetService = { getCurrentLesson(): WorksheetLesson | null; getCurrentUser(): WorksheetUser | null }
type DrawWorksheet = (canvas: HTMLCanvasElement, lesson: WorksheetLesson, user: WorksheetUser | null, answer: string) => Promise<void | string>
type Props = { service: WorksheetService; onBack(): void; draw?: DrawWorksheet }

const defaultDraw: DrawWorksheet = async (canvas, lesson, user, answer) => {
  await drawWorksheetCanvas(canvas, lesson, user, answer)
  return canvas.toDataURL('image/png')
}

function safeUrl(raw?: string) {
  try {
    const url = new URL(raw?.trim() || '')
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

function drivePreview(url: string) {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
  return match ? `https://drive.google.com/file/d/${match[1]}/preview` : url
}

export function WorksheetPage({ service, onBack, draw = defaultDraw }: Props) {
  const [lesson, setLesson] = useState<WorksheetLesson | null>(null)
  const [answer, setAnswer] = useState('')
  const [validation, setValidation] = useState('')
  const [preview, setPreview] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const open = useCallback(() => {
    setLesson(service.getCurrentLesson())
    setAnswer('')
    setValidation('')
    setPreview('')
  }, [service])

  useEffect(() => {
    window.addEventListener('nextgen:open-worksheet', open)
    return () => window.removeEventListener('nextgen:open-worksheet', open)
  }, [open])

  if (!lesson) return <section id="page-worksheet" className="hidden" />
  const url = safeUrl(lesson.worksheetUrl)
  const classroom = url.includes('classroom.google.com')
  const image = /\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i.test(url)
  const drive = url.includes('drive.google.com')

  const submit = async () => {
    const clean = answer.trim()
    if (!clean) {
      setValidation('กรุณาพิมพ์คำตอบหรือสรุปความรู้ก่อน')
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    setValidation('')
    const dataUrl = await draw(canvas, lesson, service.getCurrentUser(), clean)
    setPreview(typeof dataUrl === 'string' ? dataUrl : 'data:image/png;base64,')
  }

  const download = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const item = createWorksheetDownload(canvas, lesson.title, service.getCurrentUser()?.name || 'student')
    const link = document.createElement('a')
    link.download = item.filename
    link.href = item.href
    link.click()
  }

  return (
    <section id="page-worksheet" className="flex-1 flex flex-col relative z-20 p-4 md:p-8 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-4 gap-2"><button type="button" onClick={onBack} className="btn-action text-blue-800 font-black bg-blue-100 px-5 py-2.5 rounded-xl">← กลับสู่บทเรียน</button><h2 className="rpg-title text-2xl text-white">📝 ทำใบงาน</h2></div>
      <div className="flex flex-col lg:flex-row gap-6 w-full h-full flex-1 min-h-0">
        <div className="flex-1 rpg-box bg-white/90 p-4 md:p-6 rounded-3xl overflow-y-auto min-h-[30vh]"><h3 className="text-xl font-bold text-gray-800 mb-2 border-b-2 pb-2">📖 สรุปเนื้อหาใบงาน</h3><div className="text-gray-700 whitespace-pre-wrap">{lesson.content || 'ไม่มีเนื้อหาใบงาน'}</div>{url && <div className="mt-4"><a href={url} target="_blank" rel="noreferrer" className="w-full text-center text-blue-800 font-extrabold bg-blue-50 border-2 border-blue-300 p-4 rounded-xl flex flex-col items-center">🔗 <span className="underline">คลิกเปิดลิงก์ต้นฉบับ / Classroom</span></a></div>}{classroom && <div className="mt-3 text-center p-4 bg-gray-100 rounded-xl text-gray-500 font-bold border-2 border-dashed">Classroom ไม่อนุญาตให้แสดงแบบฝัง กรุณาเปิดจากลิงก์ด้านบน</div>}{image && <img src={url} alt="ใบงานประกอบบทเรียน" className="w-full h-auto object-contain rounded-lg mt-3 border-2" />}{drive && <iframe src={drivePreview(url)} title="ตัวอย่างใบงาน" className="w-full h-[500px] mt-3 rounded-xl border-2" allow="autoplay; encrypted-media" />}{url && !classroom && !image && !drive && <iframe src={url} title="ตัวอย่างใบงาน" sandbox="allow-forms allow-scripts allow-same-origin" className="w-full h-[500px] mt-3 rounded-xl border-2" />}</div>
        <div className="flex-1 rpg-box bg-blue-50/90 border-[3px] border-blue-200 p-4 md:p-6 rounded-3xl flex flex-col"><h3 className="text-xl font-bold text-blue-800 mb-2 border-b-2 border-blue-200 pb-2">✏️ พื้นที่ตอบคำถาม / ส่งงาน</h3><p className="text-sm text-gray-600 mb-4 font-bold">พิมพ์สรุปความรู้หรือตอบคำถามจากเนื้อหาด้านซ้าย</p><textarea value={answer} onChange={(event) => setAnswer(event.target.value)} className="w-full flex-1 rounded-xl p-4 text-gray-800 text-lg border-2 border-blue-300 resize-none" placeholder="พิมพ์ส่งงาน หรือ สรุปความรู้ได้ที่นี่..." />{validation && <p className="text-red-600 font-bold mt-2">{validation}</p>}<button type="button" onClick={() => void submit()} className="w-full btn-arcade py-4 text-xl mt-4">✅ บันทึกและรับรูปใบงาน</button></div>
      </div>
      <canvas ref={canvasRef} width="1200" height="800" className="hidden" />
      {preview && <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4"><div className="bg-gray-100 rounded-3xl p-6 md:p-8 max-w-2xl w-full flex flex-col items-center"><h3 className="text-3xl font-black text-green-600 mb-2">🎉 บันทึกใบงานสำเร็จ!</h3><p className="text-gray-600 font-bold mb-6 text-center">บันทึกรูปไว้เป็นผลงาน แล้วแนบส่งใน Classroom ได้เลย</p><img src={preview} alt="ตัวอย่างใบงานที่สร้าง" className="max-h-[40vh] object-contain rounded-lg border-4 mb-6" /><button type="button" onClick={download} className="w-full btn-action bg-blue-500 text-white font-bold py-4 text-xl rounded-xl">⬇️ เซฟรูปใบงานเก็บไว้ส่ง</button><a href="https://classroom.google.com/" target="_blank" rel="noreferrer" className="w-full mt-3 bg-white border-4 border-green-600 text-green-700 font-bold py-4 text-xl rounded-xl text-center">เข้า Classroom เพื่อส่งงาน</a><button type="button" onClick={() => setPreview('')} className="mt-4 text-gray-500 font-bold underline">ปิดหน้าต่างเพื่อพิมพ์ใหม่</button></div></div>}
    </section>
  )
}
