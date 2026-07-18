import type { FirebaseServices } from './legacyRunner'

type Data = Record<string, unknown>

export function localTutorAnswer(rawQuestion: unknown) {
  const question = String(rawQuestion || '').trim()
  return [
    'ตอนนี้ผู้พิทักษ์ความรู้ทำงานในโหมดช่วยคิดพื้นฐานครับ 🤖',
    `คำถามของผู้กล้า: “${question}”`,
    'ลองแยกคำถามเป็น 3 ส่วน: สิ่งที่รู้อยู่แล้ว, สิ่งที่ยังสงสัย และตัวอย่างจากชีวิตจริง จากนั้นทบทวนเนื้อหาในด่านปัจจุบันหรือถามคุณครูเพื่อยืนยันคำตอบนะครับ',
  ].join('\n\n')
}

export function buildProgressReport(rawStudent: unknown) {
  const student = (rawStudent || {}) as Data
  const name = String(student.name || 'ผู้เรียน')
  const className = String(student.class || '-')
  const xp = Number(student.xp) || 0
  const level = Number(student.level) || 1
  const lesson = String(student.currentLesson || 'ยังไม่ระบุ')
  return [
    `## สรุปความก้าวหน้าของ ${name}`,
    `- ชั้นเรียน: ${className}`,
    `- ระดับ: ${level}`,
    `- คะแนนสะสม: ${xp} XP`,
    `- บทเรียนปัจจุบัน: ${lesson}`,
    '',
    '### ข้อเสนอแนะ',
    xp > 0
      ? 'ผู้เรียนมีความก้าวหน้าแล้ว ควรทบทวนข้อที่ตอบผิดและตั้งเป้าผ่านบทเรียนถัดไปทีละด่าน'
      : 'ควรเริ่มจากบทเรียนแรก ทำแบบทดสอบสั้น ๆ และให้คำชมเมื่อทำภารกิจแรกสำเร็จ',
    '',
    '_รายงานนี้คำนวณจากข้อมูลในระบบโดยตรงและไม่ได้ส่งข้อมูลนักเรียนไปยังบริการภายนอก_',
  ].join('\n')
}

// Keeps the legacy GAS arity (question, lessonContext); the local fallback
// only uses the question text.
async function askNPCAi(question: unknown, context?: unknown) {
  void context
  return { success: true, answer: localTutorAnswer(question), mode: 'local-fallback' }
}

async function generateAIProgressReport(student: unknown) {
  return { success: true, answer: buildProgressReport(student), mode: 'local-fallback' }
}

async function generateLessonAndQuizWithGemini() {
  return {
    success: false,
    error: 'ปิดใช้งานการสร้างบทเรียนด้วย Gemini: Firebase Hosting แบบไม่มี trusted backend ไม่สามารถเก็บ credential ของบริการ AI ได้อย่างปลอดภัย',
  }
}

export const aiFallbackApi = {
  askNPCAi,
  generateAIProgressReport,
  generateLessonAndQuizWithGemini,
} satisfies FirebaseServices
