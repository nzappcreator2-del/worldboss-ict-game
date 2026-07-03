export type ExamReport = {
  timestamp: string
  name: string
  class: string
  totalQuestions: number
  score: number
  status: string
}

export function reportSummary(rows: Array<{ score: number }>) {
  if (!rows.length) return { count: 0, average: 0, highest: 0 }
  const scores = rows.map((row) => Number(row.score) || 0)
  return {
    count: rows.length,
    average: Number((scores.reduce((sum, score) => sum + score, 0) / rows.length).toFixed(2)),
    highest: Math.max(...scores),
  }
}

const safeCsvCell = (value: unknown) => {
  let text = String(value ?? '')
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function reportsToCsv(rows: ExamReport[]) {
  const header = ['วันที่', 'ชื่อ', 'ชั้นเรียน', 'จำนวนข้อ', 'คะแนน', 'สถานะ']
  const data = rows.map((row) => [row.timestamp, row.name, row.class, row.totalQuestions, row.score, row.status])
  return `\uFEFF${[header, ...data].map((row) => row.map(safeCsvCell).join(',')).join('\r\n')}`
}
