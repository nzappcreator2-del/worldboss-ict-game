const definitions = {
  Users: { collection: 'users', id: 'UserID' },
  Lessons: { collection: 'lessons', id: 'LessonID' },
  Questions: { collection: 'questions', id: 'QuestionID' },
  Progress: { collection: 'progress', id: (row) => `${row.UserID}_${row.LessonID}` },
  News: { collection: 'news', id: 'NewsID' },
  PVP_Matches: { collection: 'pvpMatches', id: 'MatchID' },
  WorldBoss_Config: { collection: 'worldBossConfig', id: 'BossID' },
  WorldBoss_Scores: { collection: 'worldBossScores', id: (row) => `${row.UserID}_${row.BossID}` },
  CyberSafety_Scenarios: { collection: 'cyberSafetyScenarios', id: 'ScenarioID' },
}
const textEncoder = new TextEncoder()

const fieldNames = {
  UserID: 'userId', Name: 'name', Class: 'class', XP: 'xp', Rank: 'rank', Level: 'level',
  Avatar: 'avatar', Coins: 'coins', Inventory: 'inventory', LastLogin: 'lastLogin', Streak: 'streak',
  LessonID: 'lessonId', Title: 'title', Description: 'description', VideoURL: 'videoUrl', Icon: 'icon',
  IsActive: 'isActive', EnablePretest: 'enablePretest', WorksheetURL: 'worksheetUrl', Content: 'content',
  QuestionID: 'questionId', QuestionText: 'questionText', Opt1: 'opt1', Opt2: 'opt2', Opt3: 'opt3',
  Opt4: 'opt4', Answer: 'answer', Explanation: 'explanation', Type: 'type', QuestionPattern: 'questionPattern',
  QuestionImage: 'questionImage', MatchingPairs: 'matchingPairs', Status: 'status', Score: 'score',
  NewsID: 'newsId', Date: 'date', MatchID: 'matchId', BossID: 'bossId', BossName: 'bossName',
  PoseType: 'poseType', TargetReps: 'targetReps', BossMaxHP: 'bossMaxHp', RewardCoins: 'rewardCoins',
  RewardXP: 'rewardXp', BestTimeSeconds: 'bestTime', ScenarioID: 'scenarioId', TimeOfDay: 'timeOfDay',
  ScenarioText: 'scenarioText', AnswerIdx: 'answerIdx', FeedbackWrong: 'feedbackWrong', FeedbackRight: 'feedbackRight',
  ImageSVG: 'imageSvg', Player1ID: 'p1Id', Player2ID: 'p2Id', Player1Name: 'p1Name',
  Player2Name: 'p2Name', Player1Avatar: 'p1Avatar', Player2Avatar: 'p2Avatar',
  Player1Score: 'p1Hp', Player2Score: 'p2Hp', Player1Ready: 'p1Ready',
  Player2Ready: 'p2Ready', CreatedAt: 'createdAt', Key: 'key', Value: 'value',
}

const numericFields = new Set([
  'xp', 'level', 'coins', 'streak', 'answer', 'score', 'targetReps', 'bossMaxHp', 'rewardCoins',
  'rewardXp', 'bestTime', 'answerIdx', 'p1Hp', 'p2Hp',
])
const booleanFields = new Set(['isActive', 'enablePretest', 'p1Ready', 'p2Ready'])
const jsonFields = new Set(['inventory', 'matchingPairs'])
const jsonFieldTypes = {
  inventory: 'object',
  matchingPairs: 'array',
}
const inventoryCountKeys = new Set(['potion', 'magnifier'])
const dateFields = new Set(['date', 'lastLogin', 'createdAt'])
const sheetEpoch = Date.UTC(1899, 11, 30)
const documentIdFields = new Set([
  'userId', 'lessonId', 'questionId', 'newsId', 'matchId', 'bossId', 'scenarioId',
  'p1Id', 'p2Id',
])
const blockedFieldsBySheet = {
  Users: new Set(['ownerUid']),
}
const publicSettingKeys = new Set(['TimerPerQuestion', 'Classes', 'Rooms', 'CertHeader', 'CertFooter'])

function parseValue(field, value, context = {}) {
  if (value === undefined || value === '' || (typeof value === 'string' && value.trim() === '')) return ''
  if (dateFields.has(field) && typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(sheetEpoch + value * 86_400_000)
    if (date.getUTCFullYear() > 2400) date.setUTCFullYear(date.getUTCFullYear() - 543)
    return field === 'createdAt' ? date.toISOString() : date.toISOString().slice(0, 10)
  }
  if (numericFields.has(field)) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid numeric value "${String(value)}" in sheet "${context.sheetName}" column "${context.header}" row ${context.rowNumber}.`)
    }
    return parsed
  }
  if (booleanFields.has(field)) {
    if (value === true || value === 1) return true
    if (value === false || value === 0) return false
    const normalized = String(value).trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
    if (context.sheetName === 'PVP_Matches' && normalized === 'finished') return true
    throw new Error(`Invalid boolean value "${String(value)}" in sheet "${context.sheetName}" column "${context.header}" row ${context.rowNumber}. Use TRUE or FALSE.`)
  }
  if (jsonFields.has(field) && typeof value === 'string') {
    let parsed
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new Error(`Invalid JSON value in sheet "${context.sheetName}" column "${context.header}" row ${context.rowNumber}.`)
    }
    const expectedType = jsonFieldTypes[field]
    const actualType = Array.isArray(parsed) ? 'array' : typeof parsed
    if (expectedType && actualType !== expectedType) {
      throw new Error(`Invalid JSON type in sheet "${context.sheetName}" column "${context.header}" row ${context.rowNumber}. Expected ${expectedType}.`)
    }
    if (field === 'inventory') {
      for (const [key, itemValue] of Object.entries(parsed)) {
        if (inventoryCountKeys.has(key) && (typeof itemValue !== 'number' || !Number.isFinite(itemValue) || itemValue < 0)) {
          throw new Error(`Invalid inventory count at sheet "${context.sheetName}" column "${context.header}" row ${context.rowNumber} key "${key}". Expected a non-negative number.`)
        }
      }
    }
    if (field === 'matchingPairs') {
      parsed.forEach((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item) || String(item.left || '').trim() === '' || String(item.right || '').trim() === '') {
          throw new Error(`Invalid matching pair at sheet "${context.sheetName}" column "${context.header}" row ${context.rowNumber} item ${index + 1}. Expected an object with left and right values.`)
        }
      })
    }
    return parsed
  }
  return value
}

function toRows(table, sheetName = '') {
  if (!Array.isArray(table) || table.length < 2) return []
  const headers = table[0].map(String)
  const seen = new Set()
  const usableHeaders = headers.map((header, index) => {
    if (!header) return ''
    if (seen.has(header)) {
      const hasValue = table.slice(1).some((cells) => {
        const value = cells[index]
        return value !== undefined && value !== '' && !(typeof value === 'string' && value.trim() === '')
      })
      if (hasValue) throw new Error(`Duplicate header "${header}" in sheet "${sheetName}".`)
      return ''
    }
    seen.add(header)
    return header
  })
  return table.slice(1).map((cells) => Object.fromEntries(usableHeaders.map((header, index) => [header, cells[index]])))
}

function mapRecord(row, sheetName, rowIndex) {
  const blockedFields = blockedFieldsBySheet[sheetName] || new Set()
  return Object.fromEntries(Object.entries(row).filter(([header]) => header).flatMap(([header, value]) => {
    const field = fieldNames[header] || header.charAt(0).toLowerCase() + header.slice(1)
    if (blockedFields.has(field)) return []
    const parsed = parseValue(field, value, { sheetName, header, rowNumber: rowIndex + 2 })
    return [[field, documentIdFields.has(field) ? documentId(String(parsed || '').trim(), { sheetName, header }) : parsed]]
  }))
}

function settingsDocument(table) {
  return Object.fromEntries(toRows(table, 'Settings').filter((row) => row.Key && publicSettingKeys.has(String(row.Key))).map((row) => {
    const raw = row.Value
    const value = typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw
    return [String(row.Key), value]
  }))
}

function documentId(id, context = {}) {
  const safeId = id.replaceAll('/', '_')
  if (!safeId) return safeId
  if (safeId === '.' || safeId === '..' || /^__.*__$/.test(safeId) || textEncoder.encode(safeId).length > 1500) {
    throw new Error(`Invalid Firestore document ID "${safeId}" while importing sheet "${context.sheetName || ''}".`)
  }
  return safeId
}

function isBetterWorldBossScore(candidate, existing) {
  const bossId = String(candidate.bossId || '')
  const timeBased = !bossId.startsWith('WB002') || bossId === 'WB002_SPEEDRUN'
  return timeBased ? candidate.bestTime < existing.bestTime : candidate.bestTime > existing.bestTime
}

function isBetterProgress(candidate, existing) {
  const passed = (record) => ['Passed', 'Completed'].includes(String(record.status || ''))
  if (passed(candidate) !== passed(existing)) return passed(candidate)
  return Number(candidate.score) > Number(existing.score)
}

export function mapSheetExport(source) {
  const result = {}

  for (const [sheetName, table] of Object.entries(source || {})) {
    if (sheetName === 'Settings') {
      const settings = settingsDocument(table)
      if (Object.keys(settings).length) result.settings = { public: settings }
      continue
    }

    const definition = definitions[sheetName]
    if (!definition) continue
    const documents = {}
    toRows(table, sheetName).forEach((row, index) => {
      const idValue = typeof definition.id === 'function' ? definition.id(row, index) : row[definition.id]
      const id = String(idValue || '').trim()
      if (!id || id === '_') return
      if (sheetName === 'PVP_Matches' && id.startsWith('PRIVATE_')) return
      const safeId = documentId(id, { sheetName })
      const record = mapRecord(row, sheetName, index)
      if (sheetName === 'PVP_Matches' && !['FINISHED', 'CANCELLED'].includes(String(record.status || ''))) return
      if (documents[safeId]) {
        if (sheetName === 'PVP_Matches') {
          documents[safeId] = record
          return
        }
        if (sheetName === 'Progress') {
          if (isBetterProgress(record, documents[safeId])) documents[safeId] = record
          return
        }
        if (sheetName === 'WorldBoss_Scores') {
          if (isBetterWorldBossScore(record, documents[safeId])) documents[safeId] = record
          return
        }
        throw new Error(`Duplicate Firestore document ID "${safeId}" while importing sheet "${sheetName}". Check source IDs that normalize to the same value.`)
      }
      documents[safeId] = record
    })
    if (Object.keys(documents).length) result[definition.collection] = documents
  }

  return result
}
