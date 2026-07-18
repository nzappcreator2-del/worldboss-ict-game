import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db, ensureSignedIn } from '../firebase/client'

// Field length caps must stay in sync with the clientErrors rules limits.
const MAX_REPORTS_PER_SESSION = 10

export function buildErrorReport(message: unknown, stack: unknown, source: unknown, userAgent: unknown) {
  return {
    message: String(message || 'Unknown error').slice(0, 1000),
    stack: String(stack || '').slice(0, 4000),
    source: String(source || 'unknown').slice(0, 300),
    userAgent: String(userAgent || '').slice(0, 300),
  }
}

export function createErrorReporter(save: (report: ReturnType<typeof buildErrorReport>) => Promise<void>) {
  let reported = 0
  const seen = new Set<string>()
  return async (message: unknown, stack: unknown, source: unknown) => {
    if (reported >= MAX_REPORTS_PER_SESSION) return false
    const report = buildErrorReport(message, stack, source, typeof navigator === 'undefined' ? '' : navigator.userAgent)
    const key = `${report.message}|${report.source}`
    if (seen.has(key)) return false
    seen.add(key)
    reported += 1
    try {
      await save(report)
      return true
    } catch {
      // Error reporting must never throw or the handler itself loops.
      return false
    }
  }
}

async function saveToFirestore(report: ReturnType<typeof buildErrorReport>) {
  await ensureSignedIn()
  await addDoc(collection(db, 'clientErrors'), { ...report, createdAt: serverTimestamp() })
}

export function installClientErrorReporting() {
  const report = createErrorReporter(saveToFirestore)
  window.addEventListener('error', (event) => {
    void report(event.message, event.error instanceof Error ? event.error.stack : '', event.filename || 'window.onerror')
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    void report(
      reason instanceof Error ? reason.message : String(reason ?? 'unhandledrejection'),
      reason instanceof Error ? reason.stack : '',
      'unhandledrejection',
    )
  })
}
