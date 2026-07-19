// Runtime glue for the three AI services (student tutor, progress analysis,
// lesson generation). The Gemini API key is NEVER bundled: it is loaded at
// runtime from Firestore `settings/ai`, which only the admin can write (see
// firestore.rules). Every feature degrades to the local fallback in
// aiFallbackApi when no key is configured or the API is unreachable.
import { doc, getDoc } from 'firebase/firestore'
import { db, ensureSignedIn } from '../firebase/client'
import { buildProgressReport, localTutorAnswer } from './aiFallbackApi'
import {
  AiError,
  DEFAULT_MODELS,
  buildAnalysisRequest,
  buildLessonRequest,
  buildTutorRequest,
  describeGeminiFailure,
  extractGeminiText,
  geminiEndpoint,
  normalizeLessonSpec,
  parseLessonBundle,
  type TutorTurn,
} from './geminiLogic'
import type { FirebaseServices } from './legacyRunner'

export type AiConfig = { geminiApiKey: string; chatModel?: string; contentModel?: string }

export type FetchLike = (url: string, init?: {
  method?: string
  headers?: Record<string, string>
  body?: string
}) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>

const CONFIG_CACHE_TTL_MS = 60_000
let cachedConfig: { value: AiConfig | null; at: number } | undefined

export function invalidateAiConfigCache() {
  cachedConfig = undefined
}

async function loadAiConfigFromFirestore(): Promise<AiConfig | null> {
  if (cachedConfig && Date.now() - cachedConfig.at < CONFIG_CACHE_TTL_MS) return cachedConfig.value
  try {
    await ensureSignedIn()
    const snapshot = await getDoc(doc(db, 'settings', 'ai'))
    const data = snapshot.exists() ? snapshot.data() : {}
    const geminiApiKey = String(data.geminiApiKey || '').trim()
    const value = geminiApiKey
      ? {
        geminiApiKey,
        chatModel: String(data.chatModel || '').trim() || undefined,
        contentModel: String(data.contentModel || '').trim() || undefined,
      }
      : null
    cachedConfig = { value, at: Date.now() }
    return value
  } catch {
    // Unreachable Firestore must not break the tutor: fall back locally and
    // retry on the next call instead of caching the failure.
    return null
  }
}

// 404 = the model itself is gone/limited for this account, so the next model
// in the chain may still work; 400/401/403 mean the key is bad — stop there.
const isRetriable = (status: number) => status === 404 || status === 429 || status >= 500

function toThaiError(reason: unknown): string {
  if (reason instanceof AiError) return reason.message
  return 'เชื่อมต่อบริการ AI ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'
}

function modelChain(preferred: string | undefined): string[] {
  return [...new Set([preferred || DEFAULT_MODELS[0], ...DEFAULT_MODELS])]
}

export function createAiServices({ loadConfig, fetchFn }: {
  loadConfig: () => Promise<AiConfig | null>
  fetchFn: FetchLike
}) {
  let tutorHistory: TutorTurn[] = []

  async function callGemini(apiKey: string, body: unknown, models: string[]): Promise<string> {
    let lastFailure: AiError | undefined
    for (const model of models) {
      let response: Awaited<ReturnType<FetchLike>>
      try {
        response = await fetchFn(geminiEndpoint(model), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(body),
        })
      } catch {
        lastFailure = new AiError('เชื่อมต่อบริการ AI ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')
        continue
      }
      if (!response.ok) {
        const failure = new AiError(describeGeminiFailure(response.status, await response.text().catch(() => '')))
        if (isRetriable(response.status)) {
          lastFailure = failure
          continue
        }
        throw failure
      }
      return extractGeminiText(await response.json())
    }
    throw lastFailure ?? new AiError('เชื่อมต่อบริการ AI ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
  }

  // Keeps the legacy GAS arity (question, lessonContext).
  async function askNPCAi(rawQuestion: unknown, rawContext?: unknown) {
    const question = String(rawQuestion || '').trim()
    const config = await loadConfig()
    if (!config?.geminiApiKey) {
      return { success: true, answer: localTutorAnswer(question), mode: 'local-fallback' }
    }
    try {
      const body = buildTutorRequest(question, String(rawContext || ''), tutorHistory)
      const answer = await callGemini(config.geminiApiKey, body, modelChain(config.chatModel))
      tutorHistory = [
        ...tutorHistory,
        { role: 'user', text: question } as const,
        { role: 'model', text: answer } as const,
      ].slice(-20)
      return { success: true, answer, mode: 'gemini' }
    } catch (reason) {
      return { success: false, error: toThaiError(reason) }
    }
  }

  async function generateAIProgressReport(rawStudent: unknown) {
    const student = (rawStudent || {}) as Record<string, unknown>
    const config = await loadConfig()
    if (!config?.geminiApiKey) {
      return { success: true, answer: buildProgressReport(student), mode: 'local-fallback' }
    }
    try {
      const answer = await callGemini(config.geminiApiKey, buildAnalysisRequest(student), modelChain(config.contentModel))
      return { success: true, answer, mode: 'gemini' }
    } catch (reason) {
      const fallback = `${buildProgressReport(student)}\n\n> ⚠️ สร้างรายงานด้วย AI ไม่สำเร็จ (${toThaiError(reason)}) — แสดงรายงานพื้นฐานแทน`
      return { success: true, answer: fallback, mode: 'local-fallback' }
    }
  }

  // Legacy shape: generateLessonAndQuizWithGemini(topic, numQuestions, pin).
  // New shape: generateLessonAndQuizWithGemini(spec) — see LessonSpec.
  async function generateLessonAndQuizWithGemini(rawSpec: unknown, rawCount?: unknown, _pin?: unknown) {
    void _pin
    try {
      const spec = normalizeLessonSpec(rawSpec, rawCount)
      const config = await loadConfig()
      if (!config?.geminiApiKey) {
        return { success: false, error: 'ยังไม่ได้ตั้งค่า Gemini API Key — ตั้งค่าได้ที่แท็บ "ตั้งค่า" ของผู้ดูแลระบบ' }
      }
      const text = await callGemini(config.geminiApiKey, buildLessonRequest(spec), modelChain(config.contentModel))
      return { success: true, data: parseLessonBundle(text, spec), mode: 'gemini' }
    } catch (reason) {
      return { success: false, error: toThaiError(reason) }
    }
  }

  return {
    askNPCAi,
    generateAIProgressReport,
    generateLessonAndQuizWithGemini,
    resetTutorHistory: () => { tutorHistory = [] },
  }
}

export async function testGeminiKey(rawKey: unknown, fetchFn: FetchLike = fetch as unknown as FetchLike) {
  const key = String(rawKey || '').trim()
  if (!key) return { success: false, error: 'กรุณาระบุ Gemini API Key ที่ต้องการทดสอบ' }
  try {
    const response = await fetchFn('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
      method: 'GET',
      headers: { 'x-goog-api-key': key },
    })
    if (!response.ok) return { success: false, error: describeGeminiFailure(response.status, await response.text().catch(() => '')) }
    return { success: true, message: 'คีย์ใช้งานได้ เชื่อมต่อ Gemini สำเร็จ' }
  } catch {
    return { success: false, error: 'เชื่อมต่อบริการ AI ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต' }
  }
}

const defaultServices = createAiServices({
  loadConfig: loadAiConfigFromFirestore,
  fetchFn: fetch as unknown as FetchLike,
})

export const resetTutorHistory = defaultServices.resetTutorHistory

export const aiApi = {
  askNPCAi: defaultServices.askNPCAi,
  generateAIProgressReport: defaultServices.generateAIProgressReport,
  generateLessonAndQuizWithGemini: defaultServices.generateLessonAndQuizWithGemini,
} satisfies FirebaseServices
