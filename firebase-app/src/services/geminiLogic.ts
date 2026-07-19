// Pure request/response logic for the Gemini REST API (no network, no Firestore).
// The runtime glue lives in aiApi.ts; keeping this separate makes every prompt
// and parser testable without mocking fetch.

type Data = Record<string, unknown>

export class AiError extends Error {}

// `gemini-flash-latest` tracks the newest stable Flash release; the pinned
// fallbacks cover the alias briefly pointing somewhere unavailable. Older
// 2.x models 404/429 for API keys created after mid-2026 — do not add them.
export const DEFAULT_MODELS = ['gemini-flash-latest', 'gemini-3.5-flash', 'gemini-3.1-flash-lite']

export const geminiEndpoint = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

// Age-appropriate thresholds: the audience is primary-school students.
const KID_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
]

export type TutorTurn = { role: 'user' | 'model'; text: string }

const TUTOR_HISTORY_LIMIT = 10

const TUTOR_PERSONA = [
  'คุณคือ "ผู้พิทักษ์ความรู้" 🤖 AI Tutor ประจำเกมผจญภัยการเรียนรู้ NextGen Play สำหรับนักเรียนประถมในประเทศไทย',
  'กติกาสำคัญ:',
  '- ตอบเป็นภาษาไทยเสมอ สุภาพ ใจดี ให้กำลังใจ และใช้คำที่เด็กประถมเข้าใจง่าย',
  '- ตอบสั้น กระชับ (ไม่เกิน 6-8 บรรทัด) ใช้ **ตัวหนา** เน้นคำสำคัญ และใช้ลิสต์ "- " เมื่อช่วยให้อ่านง่าย',
  '- ช่วย "คิดนำ" มากกว่าบอกคำตอบตรง ๆ เมื่อเป็นคำถามข้อสอบ ให้ชวนคิดทีละขั้น',
  '- ห้ามตอบเรื่องที่ไม่เหมาะสมกับเด็ก หากถูกถาม ให้ชวนกลับมาที่บทเรียนอย่างนุ่มนวล',
  '- คงบุคลิกผู้พิทักษ์ในโลกแฟนตาซี เรียกผู้เรียนว่า "ผู้กล้า" ได้เป็นครั้งคราว',
].join('\n')

export function buildTutorRequest(question: string, context: string, history: TutorTurn[]) {
  const recent = history.slice(-TUTOR_HISTORY_LIMIT)
  return {
    systemInstruction: { parts: [{ text: `${TUTOR_PERSONA}\n\nข้อมูลผู้เล่นตอนนี้: ${context}` }] },
    contents: [
      ...recent.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
      { role: 'user', parts: [{ text: question }] },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
      // Latency matters more than deep reasoning for a kid-facing chat.
      thinkingConfig: { thinkingBudget: 0 },
    },
    safetySettings: KID_SAFETY_SETTINGS,
  }
}

const ANALYST_PERSONA = [
  'คุณคือนักวิเคราะห์ข้อมูลการเรียนรู้ประจำโรงเรียน ช่วยครูผู้สอนวิเคราะห์นักเรียนรายบุคคลจากข้อมูลในเกม NextGen Play',
  'เขียนรายงานเป็นภาษาไทยในรูปแบบ Markdown โครงสร้าง:',
  '## สรุปภาพรวม (2-3 ประโยค)',
  '### จุดแข็ง (ลิสต์)',
  '### จุดที่ควรพัฒนา (ลิสต์)',
  '### ข้อเสนอแนะสำหรับครู (ลิสต์ ทำได้จริงในห้องเรียน)',
  '### กิจกรรมแนะนำสำหรับนักเรียน (1-2 กิจกรรม)',
  'อิงจากข้อมูลที่ได้รับเท่านั้น ห้ามแต่งข้อมูลเพิ่ม หากข้อมูลน้อยให้บอกตรง ๆ พร้อมแนะนำวิธีเก็บข้อมูลเพิ่ม',
].join('\n')

// Strip identifiers before anything leaves the device: the model only needs
// learning signals, never auth/device identity.
const ANALYSIS_FIELD_BLOCKLIST = new Set(['id', 'userId', 'ownerUid', 'deviceId', 'email'])

export function buildAnalysisRequest(student: Data) {
  const learningData = Object.fromEntries(
    Object.entries(student).filter(([key, value]) =>
      !ANALYSIS_FIELD_BLOCKLIST.has(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')),
  )
  return {
    systemInstruction: { parts: [{ text: ANALYST_PERSONA }] },
    contents: [{
      role: 'user',
      parts: [{ text: `วิเคราะห์นักเรียนคนนี้จากข้อมูลระบบ:\n${JSON.stringify(learningData, null, 2)}` }],
    }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 512 } },
  }
}

export type LessonSpec = {
  topic: string
  gradeLevel: string
  posttestCount: number
  pretestCount: number
  notes: string
  questionsOnly: '' | 'pretest' | 'posttest'
  mapStyles: Array<{ id: string; name: string }>
}

const clampCount = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback
}

export function normalizeLessonSpec(raw: unknown, rawCount?: unknown): LessonSpec {
  const source: Data = typeof raw === 'string' ? { topic: raw, posttestCount: rawCount ?? 10 } : (raw || {}) as Data
  const topic = String(source.topic || '').trim()
  if (!topic) throw new AiError('กรุณาระบุหัวข้อบทเรียนที่ต้องการให้ AI สร้าง')
  const questionsOnlyRaw = String(source.questionsOnly || '')
  const mapStylesRaw = Array.isArray(source.mapStyles) ? source.mapStyles : []
  return {
    topic,
    gradeLevel: String(source.gradeLevel || 'ป.5').trim() || 'ป.5',
    posttestCount: clampCount(source.posttestCount, 10, 1, 30),
    pretestCount: clampCount(source.pretestCount, 0, 0, 30),
    notes: String(source.notes || '').trim(),
    questionsOnly: questionsOnlyRaw === 'pretest' || questionsOnlyRaw === 'posttest' ? questionsOnlyRaw : '',
    mapStyles: mapStylesRaw
      .map((style) => style as Data)
      .filter((style) => typeof style?.id === 'string' && typeof style?.name === 'string')
      .map((style) => ({ id: String(style.id), name: String(style.name) })),
  }
}

const questionContract = [
  'แต่ละข้อ (object): {"text": "คำถามภาษาไทย", "options": ["ตัวเลือก 4 ข้อ"], "answer": เลขข้อที่ถูก 1-4, "explanation": "คำอธิบายเฉลยสั้น ๆ"}',
  'คำถามต้องหลากหลายระดับความคิด (จำ เข้าใจ นำไปใช้ วิเคราะห์) ตัวเลือกลวงต้องสมเหตุสมผล และห้ามเฉลยตกที่ข้อเดิมทุกข้อ',
].join('\n')

export function buildLessonRequest(spec: LessonSpec) {
  const audience = `เนื้อหาสำหรับนักเรียนระดับ ${spec.gradeLevel} ในประเทศไทย ใช้ภาษาไทยทั้งหมด`
  const notes = spec.notes ? `\nแนวทางเพิ่มเติมจากครู: ${spec.notes}` : ''
  const prompt = spec.questionsOnly
    ? [
      `สร้างข้อสอบแบบปรนัยเรื่อง "${spec.topic}" จำนวน ${spec.questionsOnly === 'pretest' ? spec.pretestCount || spec.posttestCount : spec.posttestCount} ข้อ (ชุด ${spec.questionsOnly})`,
      audience + notes,
      'ตอบกลับเป็น JSON array ของคำถามเท่านั้น (ไม่มีข้อความอื่น)',
      questionContract,
    ].join('\n\n')
    : [
      `ออกแบบ "ด่านผจญภัย" (บทเรียน) เรื่อง "${spec.topic}" ให้ครบทั้งด่านสำหรับเกมการเรียนรู้ NextGen Play`,
      audience + notes,
      [
        'ตอบกลับเป็น JSON object เดียว โครงสร้าง:',
        '{"lesson": {"title": "ชื่อด่านสนุก ๆ มีกลิ่นอายผจญภัย", "description": "คำโปรย 1-2 ประโยค", "content": "เนื้อหาบทเรียนฉบับเต็ม อ่านแล้วเรียนรู้ได้ด้วยตัวเอง ความยาว 300-600 คำ แบ่งย่อหน้า/หัวข้อย่อยด้วยบรรทัดใหม่", "icon": "อีโมจิ 1 ตัวที่เข้ากับเรื่อง", "mapStyle": "เลือกจากรายการด้านล่าง หรือ \\"\\" ถ้าไม่แน่ใจ"},',
        ` "pretest": [คำถามวัดพื้นฐานก่อนเรียน ${spec.pretestCount} ข้อ],`,
        ` "posttest": [คำถามหลังเรียน ${spec.posttestCount} ข้อ]}`,
      ].join('\n'),
      questionContract,
      spec.mapStyles.length
        ? `รายการ mapStyle ที่เลือกได้: ${spec.mapStyles.map((style) => `"${style.id}" (${style.name})`).join(', ')}`
        : 'mapStyle ให้ใส่ "" เสมอ',
    ].join('\n\n')
  return {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.8, responseMimeType: 'application/json' },
    safetySettings: KID_SAFETY_SETTINGS,
  }
}

export function extractGeminiText(payload: unknown): string {
  const data = (payload || {}) as Data
  const feedback = data.promptFeedback as Data | undefined
  if (feedback?.blockReason) throw new AiError('คำขอถูกบล็อกโดยระบบความปลอดภัยของ AI กรุณาปรับคำถามแล้วลองใหม่')
  const candidates = Array.isArray(data.candidates) ? data.candidates as Data[] : []
  const candidate = candidates[0]
  if (!candidate) throw new AiError('AI ไม่ได้ส่งคำตอบกลับมา กรุณาลองใหม่อีกครั้ง')
  const parts = ((candidate.content as Data | undefined)?.parts ?? []) as Array<Data>
  const text = parts.map((part) => String(part.text ?? '')).join('')
  if (!text.trim()) {
    if (candidate.finishReason === 'SAFETY') throw new AiError('คำตอบถูกระงับโดยระบบความปลอดภัยของ AI กรุณาปรับคำถามแล้วลองใหม่')
    throw new AiError('AI ส่งคำตอบว่างเปล่ากลับมา กรุณาลองใหม่อีกครั้ง')
  }
  return text
}

export type GeneratedQuestion = {
  text: string
  options: string[]
  answer: number
  explanation: string
  pattern: 'choice'
  image: ''
  matchingPairs: []
}

export type GeneratedLessonBundle = {
  lesson: { title: string; description: string; content: string; icon: string; mapStyle: string; enablePretest: boolean }
  pretest: GeneratedQuestion[]
  posttest: GeneratedQuestion[]
}

function normalizeGeneratedQuestion(raw: unknown): GeneratedQuestion | null {
  const value = (raw || {}) as Data
  const text = String(value.text || value.questionText || '').trim()
  if (!text) return null
  const options = (Array.isArray(value.options) ? value.options : []).map((option) => String(option ?? ''))
  while (options.length < 4) options.push('')
  const answer = Math.min(4, Math.max(1, Math.round(Number(value.answer) || 1)))
  return {
    text,
    options: options.slice(0, 4),
    answer,
    explanation: String(value.explanation || '').trim(),
    pattern: 'choice',
    image: '',
    matchingPairs: [],
  }
}

function parseJsonPayload(text: string): unknown {
  const unfenced = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  try {
    return JSON.parse(unfenced)
  } catch {
    // Model wrapped the JSON in prose: recover the outermost object/array.
    const start = unfenced.search(/[[{]/)
    const end = Math.max(unfenced.lastIndexOf('}'), unfenced.lastIndexOf(']'))
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(unfenced.slice(start, end + 1))
      } catch { /* fall through to the AiError below */ }
    }
    throw new AiError('AI ตอบกลับมาในรูปแบบที่อ่านไม่ได้ กรุณากด "สร้างใหม่" อีกครั้ง')
  }
}

export function parseLessonBundle(text: string, spec: LessonSpec): GeneratedLessonBundle {
  const payload = parseJsonPayload(text)
  const allowedStyles = new Set(spec.mapStyles.map((style) => style.id))

  const toQuestions = (raw: unknown) => (Array.isArray(raw) ? raw : [])
    .map(normalizeGeneratedQuestion)
    .filter((question): question is GeneratedQuestion => question !== null)

  if (spec.questionsOnly) {
    const source = Array.isArray(payload) ? payload : (payload as Data)[spec.questionsOnly] ?? (payload as Data).questions
    const questions = toQuestions(source)
    if (!questions.length) throw new AiError('AI ไม่ได้สร้างข้อสอบกลับมา กรุณาลองใหม่อีกครั้ง')
    return {
      lesson: { title: '', description: '', content: '', icon: '', mapStyle: '', enablePretest: false },
      pretest: spec.questionsOnly === 'pretest' ? questions : [],
      posttest: spec.questionsOnly === 'posttest' ? questions : [],
    }
  }

  const data = (payload || {}) as Data
  const lessonRaw = (data.lesson || {}) as Data
  const pretest = toQuestions(data.pretest)
  const posttest = toQuestions(data.posttest)
  if (!posttest.length) throw new AiError('AI ไม่ได้สร้างข้อสอบหลังเรียนกลับมา กรุณากด "สร้างใหม่" อีกครั้ง')
  const mapStyle = String(lessonRaw.mapStyle || '')
  return {
    lesson: {
      title: String(lessonRaw.title || spec.topic).trim() || spec.topic,
      description: String(lessonRaw.description || '').trim(),
      content: String(lessonRaw.content || '').trim(),
      icon: String(lessonRaw.icon || '🗺️').trim() || '🗺️',
      mapStyle: allowedStyles.has(mapStyle) ? mapStyle : '',
      enablePretest: pretest.length > 0,
    },
    pretest,
    posttest,
  }
}

export function describeGeminiFailure(status: number, bodyText: string): string {
  if (status === 400 && /api key/i.test(bodyText)) return 'Gemini API Key ไม่ถูกต้อง กรุณาตรวจสอบคีย์ในแท็บตั้งค่า'
  if (status === 401 || status === 403) return 'คีย์นี้ไม่มีสิทธิ์เรียกใช้ Gemini API กรุณาตรวจสอบคีย์หรือข้อจำกัดของคีย์'
  if (status === 404) return 'ไม่พบโมเดล AI ที่ระบุ (รุ่นอาจถูกยกเลิกแล้ว) กรุณาแจ้งผู้ดูแลระบบ'
  if (status === 429) return 'เรียกใช้ AI บ่อยเกินไปหรือโควตาหมดชั่วคราว กรุณารอสักครู่แล้วลองใหม่'
  if (status >= 500) return 'บริการ AI ขัดข้องชั่วคราว กรุณาลองใหม่ภายหลัง'
  return `บริการ AI ตอบกลับด้วยข้อผิดพลาด (${status})`
}

export function maskApiKey(key: string): string {
  if (!key) return ''
  return `••••${key.length > 7 ? key.slice(-4) : ''}`
}
