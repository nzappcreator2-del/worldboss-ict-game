import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { mapSheetExport } from './map-sheet-export.mjs'

const expectedProjectId = 'nextgen-play-19dd2'
const usage = 'Usage: npm run migrate -- <sheet-export.json> [--commit]'
const args = process.argv.slice(2)
const parsedArgs = parseMigrationArgs(args)
const commit = parsedArgs.commit
const input = parsedArgs.input
const requiredHeadersBySheet = {
  Users: ['UserID'],
  Lessons: ['LessonID'],
  Questions: ['QuestionID'],
  Progress: ['UserID', 'LessonID'],
  News: ['NewsID'],
  PVP_Matches: ['MatchID'],
  WorldBoss_Config: ['BossID'],
  WorldBoss_Scores: ['UserID', 'BossID'],
  CyberSafety_Scenarios: ['ScenarioID'],
  Settings: ['Key', 'Value'],
}

function parseMigrationArgs(rawArgs) {
  const unknownOption = rawArgs.find((arg) => arg.startsWith('--') && arg !== '--commit')
  if (unknownOption) {
    return { issue: `Unknown option "${unknownOption}". ${usage}` }
  }

  const inputs = rawArgs.filter((arg) => !arg.startsWith('--'))
  if (inputs.length > 1) {
    return { issue: `Expected exactly one sheet export input file. ${usage}` }
  }

  return {
    commit: rawArgs.includes('--commit'),
    input: inputs[0] || '',
    issue: '',
  }
}

function validateServiceAccountKey(path) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    return `Refusing to commit because GOOGLE_APPLICATION_CREDENTIALS does not point to an existing file: ${path}`
  }

  let key
  try {
    key = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return `Refusing to commit because GOOGLE_APPLICATION_CREDENTIALS is not a valid service-account JSON file: ${path}`
  }

  const missingFields = ['type', 'project_id', 'client_email', 'private_key'].filter((field) => !key[field])
  if (missingFields.length) {
    return `Refusing to commit because GOOGLE_APPLICATION_CREDENTIALS is missing service-account fields: ${missingFields.join(', ')}.`
  }

  if (key.type !== 'service_account') {
    return `Refusing to commit because GOOGLE_APPLICATION_CREDENTIALS must be a Firebase service-account key JSON file.`
  }

  if (key.project_id !== expectedProjectId) {
    return `Refusing to commit because service-account project_id "${key.project_id || ''}" does not match ${expectedProjectId}.`
  }

  return ''
}

async function loadSheetExport(path) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    return { issue: `Input sheet export file does not exist: ${path}` }
  }

  try {
    return { source: JSON.parse(await readFile(path, 'utf8')) }
  } catch {
    return { issue: `Input sheet export file is not valid JSON: ${path}` }
  }
}

function validateSheetExportShape(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return 'Input sheet export must be a JSON object keyed by legacy sheet names.'
  }

  return ''
}

function duplicatePopulatedHeader(table) {
  const headers = (table[0] || []).map(String)
  const seen = new Set()
  return headers.find((header, index) => {
    if (!header) return false
    if (seen.has(header)) {
      return table.slice(1).some((cells) => {
        const value = cells[index]
        return value !== undefined && value !== '' && !(typeof value === 'string' && value.trim() === '')
      })
    }
    seen.add(header)
    return false
  }) || ''
}

function validateRecognizedSheetTables(source) {
  for (const [sheetName, requiredHeaders] of Object.entries(requiredHeadersBySheet)) {
    if (!Object.prototype.hasOwnProperty.call(source, sheetName)) continue

    const table = source[sheetName]
    if (Array.isArray(table) && table.length === 0) continue
    if (!Array.isArray(table) || !table.every((row) => Array.isArray(row))) {
      return `Recognized legacy sheet "${sheetName}" must be a two-dimensional array exported from Google Sheets.`
    }

    const headerList = (table[0] || []).map(String)
    const duplicate = duplicatePopulatedHeader(table)
    if (duplicate) {
      return `Recognized legacy sheet "${sheetName}" contains duplicate header "${duplicate}".`
    }

    const headers = new Set(headerList)
    const missingHeader = requiredHeaders.find((header) => !headers.has(header))
    if (missingHeader) {
      return `Recognized legacy sheet "${sheetName}" is missing required header "${missingHeader}".`
    }
  }

  return ''
}

function hasImportableDocuments(mapped) {
  return Object.values(mapped).some((documents) => documents && typeof documents === 'object' && Object.keys(documents).length > 0)
}

function mapSheetExportSafely(source) {
  try {
    return { mapped: mapSheetExport(source) }
  } catch (error) {
    return { issue: `Input sheet export could not be mapped to Firestore documents: ${error instanceof Error ? error.message : String(error)}` }
  }
}

function fail(issue) {
  console.error(issue)
  process.exitCode = 1
}

async function main() {
  if (parsedArgs.issue) {
    fail(parsedArgs.issue)
    return
  }

  if (!input) {
    fail(usage)
    return
  }

  const { source, issue } = await loadSheetExport(input)
  if (issue) {
    fail(issue)
    return
  }

  const shapeIssue = validateSheetExportShape(source)
  if (shapeIssue) {
    fail(shapeIssue)
    return
  }

  const sheetIssue = validateRecognizedSheetTables(source)
  if (sheetIssue) {
    fail(sheetIssue)
    return
  }

  const { mapped, issue: mapIssue } = mapSheetExportSafely(source)
  if (mapIssue) {
    fail(mapIssue)
    return
  }

  if (!hasImportableDocuments(mapped)) {
    fail('Input sheet export did not contain any recognized legacy sheets with importable rows.')
    return
  }

  const summary = Object.fromEntries(Object.entries(mapped).map(([name, docs]) => [name, Object.keys(docs).length]))
  console.log('Documents:', summary)

  if (!commit) {
    console.log('Dry run only. Add --commit and set GOOGLE_APPLICATION_CREDENTIALS to write to Firestore.')
    return
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    fail('Refusing to commit without GOOGLE_APPLICATION_CREDENTIALS. Set it to a local service-account key path for this one-time migration.')
    return
  }

  const keyIssue = validateServiceAccountKey(process.env.GOOGLE_APPLICATION_CREDENTIALS)
  if (keyIssue) {
    fail(keyIssue)
    return
  }

  initializeApp({ credential: applicationDefault(), projectId: expectedProjectId })
  const db = getFirestore()
  let batch = db.batch()
  let pending = 0
  let written = 0

  for (const [collectionName, documents] of Object.entries(mapped)) {
    for (const [id, data] of Object.entries(documents)) {
      batch.set(db.collection(collectionName).doc(id), data, { merge: true })
      pending += 1
      written += 1
      if (pending === 400) {
        await batch.commit()
        batch = db.batch()
        pending = 0
      }
    }
  }
  if (pending) await batch.commit()
  console.log(`Imported ${written} documents.`)
}

await main()
