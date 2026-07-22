type Data = Record<string, unknown>

const publicSettingKeys = new Set(['TimerPerQuestion', 'Classes', 'Rooms', 'CertHeader', 'CertFooter'])

export function sanitizePublicSettings(settings: Data): Data {
  return Object.fromEntries(Object.entries(settings).filter(([key]) => publicSettingKeys.has(key)))
}

// The inventory is rebuilt from scratch, never key-deleted: anything a future
// feature stores in the bag (teacher-quest stamps, worksheet submissions,
// cosmetics, hero stat points) is therefore cleared by default. Keep it that
// way — a student who keeps quest stamps through a reset looks "already done"
// on work they no longer have.
export function resetUserData(user: Data): Data {
  return {
    ...user,
    xp: 0,
    rank: 'BRONZE',
    level: 1,
    coins: 0,
    inventory: {
      potion: 0,
      magnifier: 0,
      dailyDate: '',
      dailyDone: [],
      dailyProgress: { play1: 0, correct5: 0 },
      dailyAnswers: [],
      badges: [],
    },
    lastLogin: '',
    streak: 0,
  }
}

export function adminQuestion(id: string, value: Data) {
  const options = Array.isArray(value.options)
    ? [...value.options]
    : [value.opt1, value.opt2, value.opt3, value.opt4]
  while (options.length < 4) options.push('')
  return {
    id,
    lessonId: String(value.lessonId || ''),
    text: String(value.text || value.questionText || ''),
    options: options.slice(0, 4).map((option) => String(option || '')),
    answer: typeof value.answer === 'number' || typeof value.answer === 'string' ? value.answer : 1,
    explanation: String(value.explanation || ''),
    type: String(value.type || 'posttest').toLowerCase(),
    pattern: String(value.pattern || value.questionPattern) === 'matching' ? 'matching' as const : 'choice' as const,
    image: String(value.image || value.questionImage || ''),
    matchingPairs: Array.isArray(value.matchingPairs) ? value.matchingPairs : [],
  }
}

export function studentReport(user: Data, progress: Data, totalQuestions: number) {
  const updatedAt = progress.updatedAt as { toDate?: () => Date } | undefined
  const timestamp = updatedAt?.toDate ? updatedAt.toDate().toLocaleString('th-TH') : String(progress.updatedAt || '-')
  return {
    timestamp,
    name: String(user.name || ''),
    class: String(user.class || '-'),
    totalQuestions,
    score: Number(progress.score) || 0,
    status: String(progress.status || ''),
  }
}
