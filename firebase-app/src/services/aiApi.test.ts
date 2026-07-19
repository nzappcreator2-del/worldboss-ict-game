import { describe, expect, it, vi } from 'vitest'
import { createAiServices, testGeminiKey, type AiConfig, type FetchLike } from './aiApi'

type Data = Record<string, unknown>

const geminiReply = (text: string) => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }),
  text: async () => '',
})

const geminiFailure = (status: number, body = '') => ({
  ok: false,
  status,
  json: async () => ({}),
  text: async () => body,
})

const withKey: AiConfig = { geminiApiKey: 'AQ.test-key-1234' }

function makeServices(config: AiConfig | null, fetchFn: FetchLike) {
  return createAiServices({ loadConfig: async () => config, fetchFn })
}

describe('askNPCAi', () => {
  it('answers with the local fallback and never touches the network when no key is configured', async () => {
    const fetchFn = vi.fn()
    const services = makeServices(null, fetchFn as unknown as FetchLike)
    const result = await services.askNPCAi('เครือข่ายคืออะไร', 'บริบท') as Data
    expect(result.success).toBe(true)
    expect(result.mode).toBe('local-fallback')
    expect(String(result.answer)).toContain('โหมดช่วยคิดพื้นฐาน')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('sends the question to Gemini with the API key header and remembers the conversation', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiReply('เครือข่ายคือการเชื่อมต่อคอมพิวเตอร์'))
    const services = makeServices(withKey, fetchFn)
    const first = await services.askNPCAi('เครือข่ายคืออะไร', 'ชื่อผู้เล่น: ฟ้า') as Data
    expect(first).toMatchObject({ success: true, mode: 'gemini', answer: 'เครือข่ายคือการเชื่อมต่อคอมพิวเตอร์' })

    const [url, init] = fetchFn.mock.calls[0] as [string, { headers: Record<string, string>; body: string }]
    expect(url).toContain('gemini-flash-latest:generateContent')
    expect(init.headers['x-goog-api-key']).toBe('AQ.test-key-1234')

    await services.askNPCAi('แล้ว LAN ล่ะ', 'ชื่อผู้เล่น: ฟ้า')
    const second = JSON.parse((fetchFn.mock.calls[1] as [string, { body: string }])[1].body) as { contents: unknown[] }
    expect(second.contents).toHaveLength(3)
  })

  it('falls through the model chain when models are missing or rate limited', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(geminiFailure(404, 'model no longer available'))
      .mockResolvedValueOnce(geminiFailure(429))
      .mockResolvedValueOnce(geminiReply('คำตอบจากโมเดลสำรอง'))
    const services = makeServices(withKey, fetchFn)
    const result = await services.askNPCAi('คำถาม', 'บริบท') as Data
    expect(result).toMatchObject({ success: true, answer: 'คำตอบจากโมเดลสำรอง' })
    expect((fetchFn.mock.calls[1] as [string])[0]).toContain('gemini-3.5-flash')
    expect((fetchFn.mock.calls[2] as [string])[0]).toContain('gemini-3.1-flash-lite')
  })

  it('surfaces an invalid key as a Thai error without retrying other models', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiFailure(400, 'API key not valid'))
    const services = makeServices(withKey, fetchFn)
    const result = await services.askNPCAi('คำถาม', 'บริบท') as Data
    expect(result.success).toBe(false)
    expect(String(result.error)).toContain('คีย์')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('reports a friendly connection error when the network is down', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const services = makeServices(withKey, fetchFn)
    const result = await services.askNPCAi('คำถาม', 'บริบท') as Data
    expect(result.success).toBe(false)
    expect(String(result.error)).toContain('เชื่อมต่อ')
  })

  it('clears the tutor memory on reset', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiReply('ตอบ'))
    const services = makeServices(withKey, fetchFn)
    await services.askNPCAi('หนึ่ง', 'บริบท')
    services.resetTutorHistory()
    await services.askNPCAi('สอง', 'บริบท')
    const latest = JSON.parse((fetchFn.mock.calls.at(-1) as [string, { body: string }])[1].body) as { contents: unknown[] }
    expect(latest.contents).toHaveLength(1)
  })
})

describe('generateAIProgressReport', () => {
  const student = { name: 'ฟ้า', class: 'ป.5/1', xp: 120, level: 2, currentLesson: 'อินเทอร์เน็ต' }

  it('produces the deterministic local report when no key is configured', async () => {
    const services = makeServices(null, vi.fn() as unknown as FetchLike)
    const result = await services.generateAIProgressReport(student) as Data
    expect(result.success).toBe(true)
    expect(result.mode).toBe('local-fallback')
    expect(String(result.answer)).toContain('สรุปความก้าวหน้าของ ฟ้า')
  })

  it('returns the Gemini analysis when the call succeeds', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiReply('## สรุปภาพรวม\nฟ้ามีพัฒนาการดี'))
    const services = makeServices(withKey, fetchFn)
    const result = await services.generateAIProgressReport(student) as Data
    expect(result).toMatchObject({ success: true, mode: 'gemini' })
    expect(String(result.answer)).toContain('สรุปภาพรวม')
  })

  it('degrades to the local report with a warning when Gemini fails', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiFailure(503))
    const services = makeServices(withKey, fetchFn)
    const result = await services.generateAIProgressReport(student) as Data
    expect(result.success).toBe(true)
    expect(result.mode).toBe('local-fallback')
    expect(String(result.answer)).toContain('สรุปความก้าวหน้าของ ฟ้า')
    expect(String(result.answer)).toContain('รายงานพื้นฐาน')
  })
})

describe('generateLessonAndQuizWithGemini', () => {
  const bundle = {
    lesson: { title: 'ผจญภัยระบบสุริยะ', description: 'ตะลุยดาว', content: 'เนื้อหา', icon: '🪐', mapStyle: '' },
    pretest: [],
    posttest: [{ text: 'โลกอยู่ลำดับที่เท่าใด', options: ['1', '2', '3', '4'], answer: 3, explanation: 'ลำดับที่ 3' }],
  }

  it('requires a configured key before generating content', async () => {
    const services = makeServices(null, vi.fn() as unknown as FetchLike)
    const result = await services.generateLessonAndQuizWithGemini({ topic: 'ระบบสุริยะ' }) as Data
    expect(result.success).toBe(false)
    expect(String(result.error)).toContain('Gemini API Key')
  })

  it('generates and normalizes a full lesson bundle', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiReply(JSON.stringify(bundle)))
    const services = makeServices(withKey, fetchFn)
    const result = await services.generateLessonAndQuizWithGemini({ topic: 'ระบบสุริยะ', posttestCount: 1 }) as Data
    expect(result.success).toBe(true)
    const data = result.data as { lesson: { title: string }; posttest: unknown[] }
    expect(data.lesson.title).toBe('ผจญภัยระบบสุริยะ')
    expect(data.posttest).toHaveLength(1)
  })

  it('supports the legacy (topic, count, pin) call shape', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiReply(JSON.stringify(bundle)))
    const services = makeServices(withKey, fetchFn)
    const result = await services.generateLessonAndQuizWithGemini('ระบบสุริยะ', 5, 'pin') as Data
    expect(result.success).toBe(true)
    const body = (fetchFn.mock.calls[0] as [string, { body: string }])[1].body
    expect(body).toContain('ระบบสุริยะ')
  })

  it('rejects an empty topic and unreadable AI output with Thai errors', async () => {
    const services = makeServices(withKey, vi.fn().mockResolvedValue(geminiReply('ไม่ใช่ json')))
    expect((await services.generateLessonAndQuizWithGemini({ topic: '' }) as Data).success).toBe(false)
    const result = await services.generateLessonAndQuizWithGemini({ topic: 'ระบบสุริยะ' }) as Data
    expect(result.success).toBe(false)
    expect(String(result.error)).toContain('สร้างใหม่')
  })
})

describe('testGeminiKey', () => {
  it('accepts a key the API recognizes and rejects a bad one with details', async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ models: [] }), text: async () => '' })
    expect((await testGeminiKey('AQ.valid', ok as unknown as FetchLike) as Data).success).toBe(true)
    expect((ok.mock.calls[0] as [string])[0]).toContain('models')

    const bad = vi.fn().mockResolvedValue(geminiFailure(400, 'API key not valid'))
    const result = await testGeminiKey('broken', bad as unknown as FetchLike) as Data
    expect(result.success).toBe(false)
    expect(String(result.error)).toContain('คีย์')

    expect((await testGeminiKey('  ', ok as unknown as FetchLike) as Data).success).toBe(false)
  })
})
