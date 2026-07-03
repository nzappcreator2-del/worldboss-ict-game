export type WorksheetLesson = { title: string }
export type WorksheetUser = { name: string; class: string; avatar?: string }

export async function drawWorksheetCanvas(canvas: HTMLCanvasElement, lesson: WorksheetLesson, user: WorksheetUser | null, answer: string) {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is not supported')
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.strokeStyle = '#1e3a8a'
  context.lineWidth = 10
  context.strokeRect(15, 15, canvas.width - 30, canvas.height - 30)
  context.strokeStyle = '#3b82f6'
  context.lineWidth = 3
  context.strokeRect(30, 30, canvas.width - 60, canvas.height - 60)
  context.textAlign = 'center'
  context.fillStyle = '#1e3a8a'
  context.font = 'bold 36px "Prompt", sans-serif'
  context.fillText('ใบงานสรุปความรู้ 📝', canvas.width / 2, 80)
  context.fillStyle = '#1d4ed8'
  context.font = 'bold 24px "Prompt", sans-serif'
  context.fillText(`ด่าน/บทเรียน: ${lesson.title}`, canvas.width / 2, 120)
  if (user) {
    context.fillStyle = '#374151'
    context.font = 'bold 22px "Prompt", sans-serif'
    context.fillText(`จัดทำโดย: ${user.name} | ชั้น: ${user.class} | Avatar: ${user.avatar || ''}`, canvas.width / 2, 160)
  }
  context.beginPath()
  context.moveTo(100, 190)
  context.lineTo(canvas.width - 100, 190)
  context.lineWidth = 2
  context.strokeStyle = '#cbd5e1'
  context.stroke()
  context.textAlign = 'left'
  context.fillStyle = '#1f2937'
  context.font = '22px "Prompt", sans-serif'

  let y = 240
  const maxWidth = canvas.width - 140
  for (const paragraph of answer.split('\n')) {
    let line = ''
    for (const word of paragraph.split(' ')) {
      const candidate = `${line}${word} `
      if (context.measureText(candidate).width > maxWidth && line) {
        context.fillText(line, 70, y)
        line = `${word} `
        y += 36
      } else line = candidate
    }
    context.fillText(line, 70, y)
    y += 36
  }
  context.textAlign = 'center'
  context.fillStyle = '#94a3b8'
  context.font = '16px "Prompt", sans-serif'
  context.fillText('--- สร้างโดยระบบเกม NextGen Play ---', canvas.width / 2, canvas.height - 50)
}

const safePart = (value: string) => value.trim().replace(/[^\p{L}\p{M}\p{N}._-]/gu, '_') || 'student'

export function createWorksheetDownload(canvas: HTMLCanvasElement, lessonTitle: string, studentName: string) {
  return {
    filename: `ใบงาน_${safePart(lessonTitle)}_${safePart(studentName)}.png`,
    href: canvas.toDataURL('image/png'),
  }
}
