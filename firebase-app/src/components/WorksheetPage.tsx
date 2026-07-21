import { useCallback, useEffect, useRef, useState } from 'react'
import worksheetBackground from '../assets/generated/worksheet-grand-archive.jpg'
import { createWorksheetDownload, drawWorksheetCanvas, type WorksheetUser } from './worksheetCanvas'

export type WorksheetLesson = { id: string; title: string; content?: string; worksheetUrl?: string }
export type WorksheetSubmissionStats = { xp: number; coins: number; level: number; rank: string; gainedXp: number; gainedCoins: number }
export type WorksheetSubmissionResult = { success: boolean; firstSubmission?: boolean; stats?: WorksheetSubmissionStats; error?: string }
export type WorksheetService = {
  getCurrentLesson(): WorksheetLesson | null
  getCurrentUser(): WorksheetUser | null
  saveSubmission?(lessonId: string, answer: string): Promise<WorksheetSubmissionResult>
}
type DrawWorksheet = (canvas: HTMLCanvasElement, lesson: WorksheetLesson, user: WorksheetUser | null, answer: string) => Promise<void | string>
type SubmitState = '' | 'saving' | 'saved-first' | 'saved-again' | 'save-failed'
type Props = { service: WorksheetService; onBack(): void; onUserUpdate?(stats: WorksheetSubmissionStats): void; draw?: DrawWorksheet }

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

function workspacePreview(url: string) {
  const presentation = url.match(/^https:\/\/docs\.google\.com\/presentation\/d\/([^/?#]+)/i)
  if (presentation) return `https://docs.google.com/presentation/d/${presentation[1]}/embed?start=false&loop=false&delayms=3000`
  const document = url.match(/^https:\/\/docs\.google\.com\/document\/d\/([^/?#]+)/i)
  if (document) return `https://docs.google.com/document/d/${document[1]}/preview`
  const spreadsheet = url.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([^/?#]+)/i)
  if (spreadsheet) return `https://docs.google.com/spreadsheets/d/${spreadsheet[1]}/preview`
  if (/^https:\/\/docs\.google\.com\/forms\//i.test(url)) return `${url}${url.includes('?') ? '&' : '?'}embedded=true`
  return ''
}

function worksheetEmbedUrl(url: string) {
  if (!url || url.includes('classroom.google.com')) return ''
  if (url.includes('drive.google.com')) return drivePreview(url)
  return workspacePreview(url) || url
}

export function WorksheetPage({ service, onBack, onUserUpdate, draw = defaultDraw }: Props) {
  const [lesson, setLesson] = useState<WorksheetLesson | null>(null)
  const [answer, setAnswer] = useState('')
  const [validation, setValidation] = useState('')
  const [preview, setPreview] = useState('')
  const [submitState, setSubmitState] = useState<SubmitState>('')
  const [rewardStats, setRewardStats] = useState<WorksheetSubmissionStats | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const open = useCallback(() => {
    setLesson(service.getCurrentLesson())
    setAnswer('')
    setValidation('')
    setPreview('')
    setSubmitState('')
    setRewardStats(null)
  }, [service])

  const close = useCallback(() => {
    // Remove the fixed worksheet layer immediately. Navigation is still called
    // afterwards, but a delayed/failed legacy transition can no longer leave an
    // invisible overlay intercepting clicks over the resumed lesson.
    setPreview('')
    setLesson(null)
    onBack()
  }, [onBack])

  useEffect(() => {
    window.addEventListener('nextgen:open-worksheet', open)
    return () => window.removeEventListener('nextgen:open-worksheet', open)
  }, [open])

  if (!lesson) return <section id="page-worksheet" className="hidden" />
  const url = safeUrl(lesson.worksheetUrl)
  const classroom = url.includes('classroom.google.com')
  const image = /\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i.test(url)
  const embeddedUrl = image ? '' : worksheetEmbedUrl(url)

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
    // Online copy for the teacher plus the one-time study reward; the PNG flow
    // above already succeeded, so a failed save must never block the download.
    if (!service.saveSubmission) return
    setSubmitState('saving')
    setRewardStats(null)
    try {
      const saved = await service.saveSubmission(lesson.id, clean)
      if (!saved.success) throw new Error(saved.error || 'save failed')
      setSubmitState(saved.firstSubmission ? 'saved-first' : 'saved-again')
      if (saved.stats) {
        setRewardStats(saved.stats)
        onUserUpdate?.(saved.stats)
      }
    } catch {
      setSubmitState('save-failed')
    }
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
    <section id="page-worksheet" className="worksheet-page" style={{ backgroundImage: `url(${worksheetBackground})` }}>
      <div className="worksheet-page-shade" aria-hidden="true" />
      <header className="worksheet-command-bar">
        <button type="button" onClick={close} className="worksheet-back-button">← กลับสู่บทเรียน</button>
        <div className="worksheet-title-lockup">
          <span aria-hidden="true">📜</span>
          <div><small>ADVENTURER STUDY QUEST</small><h2>ภารกิจใบงาน</h2><p>{lesson.title}</p></div>
        </div>
        <button type="button" onClick={close} aria-label="ปิดหน้าใบงาน" className="worksheet-close-button">×</button>
      </header>

      <main className="worksheet-workspace">
        <section className="worksheet-panel worksheet-source-panel" aria-label="เอกสารและเนื้อหาใบงาน">
          <header className="worksheet-panel-heading">
            <div><span aria-hidden="true">📚</span><div><small>KNOWLEDGE ARCHIVE</small><h3>เอกสารประกอบภารกิจ</h3></div></div>
            <b className={url ? 'is-ready' : ''}>{url ? '✦ เอกสารพร้อมอ่าน' : '◆ เนื้อหาบทเรียน'}</b>
          </header>

          {url && (
            <div className="worksheet-source-toolbar">
              <span>{classroom ? 'Google Classroom' : image ? 'ภาพใบงาน' : 'ตัวแสดงเอกสารแบบฝัง'}</span>
              <a href={url} target="_blank" rel="noreferrer" aria-label="เปิดลิงก์ต้นฉบับ / Classroom">↗ เปิดลิงก์ต้นฉบับ</a>
            </div>
          )}

          <div className="worksheet-document-viewer">
            {classroom && (
              <div className="worksheet-embed-fallback">
                <span aria-hidden="true">🏫</span><h4>เปิดภารกิจใน Google Classroom</h4>
                <p>Classroom ไม่อนุญาตให้แสดงแบบฝัง กรุณาเปิดลิงก์ต้นฉบับเพื่อดูคำสั่งและไฟล์จากครู</p>
                <a href={url} target="_blank" rel="noreferrer">เข้า Classroom</a>
              </div>
            )}
            {image && <img src={url} alt="ใบงานประกอบบทเรียน" />}
            {embeddedUrl && (
              <iframe
                src={embeddedUrl}
                title="ตัวอย่างใบงาน"
                sandbox="allow-forms allow-scripts allow-same-origin allow-presentation allow-popups"
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            )}
            {!url && <div className="worksheet-summary-only">{lesson.content || 'ไม่มีเนื้อหาใบงาน'}</div>}
          </div>

          {url && (
            <details className="worksheet-lesson-summary" open={classroom}>
              <summary>📖 สรุปเนื้อหาใบงาน</summary>
              <div>{lesson.content || 'ไม่มีเนื้อหาใบงาน'}</div>
            </details>
          )}
        </section>

        <section className="worksheet-panel worksheet-answer-panel" aria-label="พื้นที่ตอบคำถามและส่งงาน">
          <header className="worksheet-panel-heading">
            <div><span aria-hidden="true">✍️</span><div><small>QUEST RESPONSE</small><h3>บันทึกคำตอบส่งครู</h3></div></div>
            <b className="is-ready">+40 XP · +25 🪙</b>
          </header>
          <div className="worksheet-quest-instructions">
            <span>1</span><p><b>อ่านเอกสาร</b><small>เลื่อนดูสไลด์ เอกสาร หรือ PDF ทางด้านซ้าย</small></p>
            <span>2</span><p><b>สรุปความรู้</b><small>เขียนคำตอบด้วยภาษาของนักเรียนเอง</small></p>
            <span>3</span><p><b>บันทึกและส่ง</b><small>ระบบสร้างรูปใบงานพร้อมบันทึกให้ครู</small></p>
          </div>
          <label className="worksheet-answer-label" htmlFor="worksheet-answer">คำตอบของผู้กล้า</label>
          <textarea id="worksheet-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="พิมพ์ส่งงาน หรือ สรุปความรู้ได้ที่นี่..." />
          {validation && <p role="alert" className="worksheet-validation">{validation}</p>}
          <div className="worksheet-submit-zone">
            <p>🎁 ส่งครั้งแรกได้รับรางวัลการเรียนรู้ และยังเซฟรูปไปส่ง Classroom ได้เหมือนเดิม</p>
            <button type="button" onClick={() => void submit()} disabled={submitState === 'saving'}>✅ บันทึกและรับรูปใบงาน</button>
          </div>
        </section>
      </main>

      <canvas ref={canvasRef} width="1200" height="800" className="hidden" />
      {preview && (
        <div className="worksheet-result-backdrop">
          <div className="worksheet-result-card">
            <span className="worksheet-result-emblem" aria-hidden="true">🏆</span>
            <h3>บันทึกใบงานสำเร็จ!</h3>
            <p>บันทึกรูปไว้เป็นผลงาน แล้วแนบส่งใน Classroom ได้เลย</p>
            {submitState === 'saving' && <p className="worksheet-save-status">⏳ กำลังบันทึกส่งครูออนไลน์...</p>}
            {submitState === 'saved-first' && rewardStats && <p data-testid="worksheet-reward" className="worksheet-reward-status">🎁 ส่งงานถึงครูแล้ว! ได้รับ +{rewardStats.gainedXp} XP +{rewardStats.gainedCoins} เหรียญ</p>}
            {submitState === 'saved-again' && <p className="worksheet-save-status">📮 ส่งฉบับใหม่ถึงครูแล้ว (รางวัลรับได้เฉพาะครั้งแรก)</p>}
            {submitState === 'save-failed' && <p className="worksheet-save-error">⚠️ บันทึกส่งครูออนไลน์ไม่สำเร็จ — ยังดาวน์โหลดรูปไปส่งใน Classroom ได้ตามปกติ</p>}
            <img src={preview} alt="ตัวอย่างใบงานที่สร้าง" />
            <div className="worksheet-result-actions">
              <button type="button" onClick={download}>⬇️ เซฟรูปใบงานเก็บไว้ส่ง</button>
              <a href="https://classroom.google.com/" target="_blank" rel="noreferrer">🏫 เข้า Classroom เพื่อส่งงาน</a>
            </div>
            <button type="button" onClick={close} className="worksheet-result-dismiss">ปิดหน้าต่างและเล่นต่อ</button>
          </div>
        </div>
      )}
    </section>
  )
}
