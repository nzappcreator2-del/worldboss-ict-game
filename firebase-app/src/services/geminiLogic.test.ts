import { describe, expect, it } from 'vitest'
import {
  AiError,
  buildAnalysisRequest,
  buildLessonRequest,
  buildTutorRequest,
  describeGeminiFailure,
  extractGeminiText,
  geminiEndpoint,
  maskApiKey,
  normalizeLessonSpec,
  parseLessonBundle,
  type TutorTurn,
} from './geminiLogic'

type Data = Record<string, unknown>

describe('geminiEndpoint', () => {
  it('targets the v1beta generateContent REST endpoint for the model', () => {
    expect(geminiEndpoint('gemini-2.5-flash'))
      .toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent')
  })
})

describe('buildTutorRequest', () => {
  it('carries the guardian persona, the player context, and the question', () => {
    const request = buildTutorRequest('เครือข่ายคืออะไร', 'ชื่อผู้เล่น: ฟ้า, ด่าน: อินเทอร์เน็ต', []) as Data
    const system = JSON.stringify(request.systemInstruction)
    expect(system).toContain('ผู้พิทักษ์ความรู้')
    expect(system).toContain('ชื่อผู้เล่น: ฟ้า, ด่าน: อินเทอร์เน็ต')
    const contents = request.contents as Array<{ role: string; parts: Array<{ text: string }> }>
    expect(contents.at(-1)).toEqual({ role: 'user', parts: [{ text: 'เครือข่ายคืออะไร' }] })
  })

  it('keeps only the latest ten history turns ahead of the new question', () => {
    const history: TutorTurn[] = Array.from({ length: 14 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'model',
      text: `ข้อความ ${index}`,
    }))
    const request = buildTutorRequest('คำถามใหม่', 'บริบท', history) as Data
    const contents = request.contents as Array<{ parts: Array<{ text: string }> }>
    expect(contents).toHaveLength(11)
    expect(contents[0].parts[0].text).toBe('ข้อความ 4')
    expect(contents.at(-1)?.parts[0].text).toBe('คำถามใหม่')
  })

  it('disables thinking for fast kid-facing answers and applies safety settings', () => {
    const request = buildTutorRequest('คำถาม', 'บริบท', []) as Data
    expect((request.generationConfig as Data).thinkingConfig).toEqual({ thinkingBudget: 0 })
    expect(Array.isArray(request.safetySettings)).toBe(true)
    expect((request.safetySettings as Data[]).length).toBeGreaterThan(0)
  })
})

describe('buildAnalysisRequest', () => {
  it('sends the student snapshot to an analyst persona that answers in Thai markdown', () => {
    const request = buildAnalysisRequest({ name: 'ฟ้า', class: 'ป.5/1', xp: 120, level: 2, currentLesson: 'อินเทอร์เน็ต' }) as Data
    const prompt = JSON.stringify(request.contents)
    expect(prompt).toContain('ฟ้า')
    expect(prompt).toContain('ป.5/1')
    expect(prompt).toContain('120')
    expect(JSON.stringify(request.systemInstruction)).toContain('นักวิเคราะห์')
  })

  it('never forwards device or auth identifiers to the model', () => {
    const request = buildAnalysisRequest({ name: 'ฟ้า', ownerUid: 'secret-uid', id: 'user-77', deviceId: 'D1' })
    const serialized = JSON.stringify(request)
    expect(serialized).not.toContain('secret-uid')
    expect(serialized).not.toContain('user-77')
    expect(serialized).not.toContain('D1')
  })
})

describe('normalizeLessonSpec', () => {
  it('accepts the legacy (topic, count) call shape', () => {
    const spec = normalizeLessonSpec('อินเทอร์เน็ตเบื้องต้น', 7)
    expect(spec.topic).toBe('อินเทอร์เน็ตเบื้องต้น')
    expect(spec.posttestCount).toBe(7)
    expect(spec.pretestCount).toBe(0)
    expect(spec.questionsOnly).toBe('')
  })

  it('accepts the object shape and clamps question counts', () => {
    const spec = normalizeLessonSpec({
      topic: ' ระบบสุริยะ ',
      gradeLevel: 'ป.6',
      posttestCount: 99,
      pretestCount: -3,
      notes: 'เน้นดาวเคราะห์',
      questionsOnly: 'posttest',
      mapStyles: [{ id: 'volcano-forge', name: 'เตาหลอมภูเขาไฟ' }, { id: 7, name: null }],
    })
    expect(spec.topic).toBe('ระบบสุริยะ')
    expect(spec.gradeLevel).toBe('ป.6')
    expect(spec.posttestCount).toBe(30)
    expect(spec.pretestCount).toBe(0)
    expect(spec.notes).toBe('เน้นดาวเคราะห์')
    expect(spec.questionsOnly).toBe('posttest')
    expect(spec.mapStyles).toEqual([{ id: 'volcano-forge', name: 'เตาหลอมภูเขาไฟ' }])
  })

  it('rejects an empty topic with a Thai error', () => {
    expect(() => normalizeLessonSpec({ topic: '   ' })).toThrow(AiError)
    expect(() => normalizeLessonSpec('')).toThrow(/หัวข้อ/)
  })
})

describe('buildLessonRequest', () => {
  it('forces JSON output and describes the full lesson bundle contract', () => {
    const spec = normalizeLessonSpec({ topic: 'ระบบสุริยะ', gradeLevel: 'ป.5', posttestCount: 10, pretestCount: 5, mapStyles: [{ id: 'volcano-forge', name: 'เตาหลอมภูเขาไฟ' }] })
    const request = buildLessonRequest(spec) as Data
    expect((request.generationConfig as Data).responseMimeType).toBe('application/json')
    const prompt = JSON.stringify(request.contents)
    expect(prompt).toContain('ระบบสุริยะ')
    expect(prompt).toContain('ป.5')
    expect(prompt).toContain('10')
    expect(prompt).toContain('volcano-forge')
    expect(prompt).toContain('pretest')
  })

  it('asks for a bare question array when only one question set is requested', () => {
    const spec = normalizeLessonSpec({ topic: 'ระบบสุริยะ', posttestCount: 4, questionsOnly: 'posttest' })
    const prompt = JSON.stringify((buildLessonRequest(spec) as Data).contents)
    expect(prompt).toContain('JSON array')
    expect(prompt).not.toContain('"lesson"')
  })
})

describe('extractGeminiText', () => {
  it('joins every text part of the first candidate', () => {
    const payload = { candidates: [{ content: { parts: [{ text: 'ตอน' }, { text: 'จบ' }] } }] }
    expect(extractGeminiText(payload)).toBe('ตอนจบ')
  })

  it('reports prompt blocks, safety stops, and empty responses in Thai', () => {
    expect(() => extractGeminiText({ promptFeedback: { blockReason: 'SAFETY' } })).toThrow(/ปลอดภัย|บล็อก/)
    expect(() => extractGeminiText({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] })).toThrow(/ปลอดภัย|บล็อก/)
    expect(() => extractGeminiText({ candidates: [] })).toThrow(AiError)
    expect(() => extractGeminiText(undefined)).toThrow(AiError)
  })
})

describe('parseLessonBundle', () => {
  const spec = normalizeLessonSpec({ topic: 'ระบบสุริยะ', posttestCount: 2, pretestCount: 1, mapStyles: [{ id: 'volcano-forge', name: 'เตาหลอมภูเขาไฟ' }] })
  const bundleJson = JSON.stringify({
    lesson: { title: 'ผจญภัยระบบสุริยะ', description: 'ตะลุยดาวเคราะห์', content: 'ระบบสุริยะประกอบด้วย...', icon: '🪐', mapStyle: 'volcano-forge' },
    pretest: [{ text: 'ดวงอาทิตย์คืออะไร', options: ['ดาวฤกษ์', 'ดาวเคราะห์'], answer: '1', explanation: 'ดวงอาทิตย์เป็นดาวฤกษ์' }],
    posttest: [
      { text: 'ดาวเคราะห์ดวงใดใกล้ดวงอาทิตย์ที่สุด', options: ['พุธ', 'ศุกร์', 'โลก', 'อังคาร'], answer: 9, explanation: 'ดาวพุธอยู่ใกล้ที่สุด' },
      { text: '', options: [], answer: 1, explanation: '' },
      { text: 'โลกอยู่ลำดับที่เท่าใด', options: ['1', '2', '3', '4'], answer: 3, explanation: 'โลกเป็นลำดับที่ 3' },
    ],
  })

  it('normalizes questions: pads options to 4, clamps answers to 1-4, drops empty rows', () => {
    const bundle = parseLessonBundle(bundleJson, spec)
    expect(bundle.lesson.title).toBe('ผจญภัยระบบสุริยะ')
    expect(bundle.lesson.mapStyle).toBe('volcano-forge')
    expect(bundle.lesson.enablePretest).toBe(true)
    expect(bundle.pretest).toHaveLength(1)
    expect(bundle.pretest[0].options).toHaveLength(4)
    expect(bundle.pretest[0].answer).toBe(1)
    expect(bundle.posttest).toHaveLength(2)
    expect(bundle.posttest[0].answer).toBe(4)
    expect(bundle.posttest.every((question) => question.pattern === 'choice')).toBe(true)
  })

  it('strips markdown fences and rejects unknown map styles', () => {
    const fenced = '```json\n' + bundleJson.replace('volcano-forge', 'space-station') + '\n```'
    const bundle = parseLessonBundle(fenced, spec)
    expect(bundle.lesson.mapStyle).toBe('')
  })

  it('accepts a bare question array in questions-only mode', () => {
    const only = normalizeLessonSpec({ topic: 'ระบบสุริยะ', posttestCount: 1, questionsOnly: 'posttest' })
    const bundle = parseLessonBundle('[{"text":"ข้อเดียว","options":["ก","ข","ค","ง"],"answer":2,"explanation":"เพราะ ข"}]', only)
    expect(bundle.posttest).toHaveLength(1)
    expect(bundle.posttest[0].answer).toBe(2)
    expect(bundle.pretest).toHaveLength(0)
  })

  it('raises Thai errors for unparsable JSON or an empty question set', () => {
    expect(() => parseLessonBundle('ไม่ใช่ json', spec)).toThrow(AiError)
    expect(() => parseLessonBundle('{"lesson":{"title":"x"},"posttest":[]}', spec)).toThrow(/ข้อสอบ|คำถาม/)
  })
})

describe('describeGeminiFailure', () => {
  it('maps the common REST failures to teacher-friendly Thai messages', () => {
    expect(describeGeminiFailure(400, 'API key not valid. Please pass a valid API key.')).toMatch(/คีย์|API Key/i)
    expect(describeGeminiFailure(403, '')).toMatch(/สิทธิ์|คีย์/)
    expect(describeGeminiFailure(429, '')).toMatch(/โควตา|บ่อยเกินไป/)
    expect(describeGeminiFailure(503, '')).toMatch(/ชั่วคราว|ภายหลัง/)
    expect(describeGeminiFailure(418, 'teapot')).toContain('418')
  })
})

describe('maskApiKey', () => {
  it('keeps only the last four characters visible', () => {
    expect(maskApiKey('AQ.Ab8RN6EXAMPLE1234')).toBe('••••1234')
    expect(maskApiKey('abc')).toBe('••••')
    expect(maskApiKey('')).toBe('')
  })
})
