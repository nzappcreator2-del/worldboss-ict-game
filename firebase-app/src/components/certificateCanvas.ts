import type { CertificateSettings, CertificateUser } from './Certificate'

export function createCertificateDownload(canvas: HTMLCanvasElement, rawName: string) {
  const invalid = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])
  const safeName = Array.from(rawName.trim()).map((character) => (
    /\s/.test(character) || invalid.has(character) || character.charCodeAt(0) < 32 ? '_' : character
  )).join('') || 'student'
  return { filename: `เกียรติบัตร_${safeName}.png`, href: canvas.toDataURL('image/png') }
}

export async function drawCertificateCanvas(canvas: HTMLCanvasElement, user: CertificateUser, settings: CertificateSettings, date: Date) {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not supported')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const background = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  background.addColorStop(0, '#fef9c3')
  background.addColorStop(0.5, '#fffbeb')
  background.addColorStop(1, '#fef3c7')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = '#d97706'
  ctx.lineWidth = 8
  ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40)
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 3
  ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60)

  const logo = await loadLogo('https://i.postimg.cc/ZnHTDXT2/1.png')
  if (logo) ctx.drawImage(logo, 350, 35, 100, 100)
  else {
    ctx.textAlign = 'center'
    ctx.font = '64px sans-serif'
    ctx.fillText('🏆', 400, 110)
  }

  ctx.textAlign = 'center'
  drawText(ctx, settings.CertHeader || '🏆 ICT Talent CONNEXT ED 🏆', 400, 165, 'bold 20px "Prompt", sans-serif', '#92400e')
  drawText(ctx, 'เกียรติบัตร', 400, 210, 'bold 40px "Prompt", sans-serif', '#78350f')
  drawText(ctx, 'ขอมอบเกียรติบัตรฉบับนี้เพื่อแสดงว่า', 400, 255, '16px "Prompt", sans-serif', '#a16207')
  drawText(ctx, user.name, 400, 320, 'bold 36px "Prompt", sans-serif', '#1e3a5f')
  drawText(ctx, `ชั้น ${user.class}`, 400, 355, '18px "Prompt", sans-serif', '#6b7280')
  drawText(ctx, 'ได้สำเร็จหลักสูตรการเรียนรู้ เกมการเรียนรู้ NextGen Play', 400, 400, '16px "Prompt", sans-serif', '#78350f')
  drawText(ctx, 'ด้วยผลงานที่ยอดเยี่ยม', 400, 425, '16px "Prompt", sans-serif', '#78350f')
  drawText(ctx, `${user.avatar || '🧙‍♂️'}  XP: ${user.xp || 0}  |  Rank: ${user.rank || 'BRONZE'}  |  Level: ${user.level || 1}`, 400, 480, 'bold 22px "Prompt", sans-serif', '#7c3aed')
  drawText(ctx, '⭐ ⭐ ⭐', 400, 530, '40px "Prompt", sans-serif', '#7c3aed')
  drawText(ctx, `วันที่: ${thaiDate(date)}`, 400, 580, '14px "Prompt", sans-serif', '#6b7280')
  drawText(ctx, settings.CertFooter || 'ICT Talent CONNEXT ED ภาคกลาง', 400, 605, '14px "Prompt", sans-serif', '#6b7280')
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, color: string) {
  ctx.font = font
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}

function thaiDate(date: Date) {
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
}

function loadLogo(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    let settled = false
    const finish = (result: HTMLImageElement | null) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
    }
    const timeout = window.setTimeout(() => finish(null), 2500)
    image.crossOrigin = 'anonymous'
    image.onload = () => finish(image)
    image.onerror = () => finish(null)
    image.src = src
  })
}
