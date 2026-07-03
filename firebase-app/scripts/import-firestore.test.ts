import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(new URL('./import-firestore.mjs', import.meta.url))

function withSheetExport(run: (path: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'nextgen-play-import-'))
  const path = join(dir, 'sheet-export.json')

  try {
    writeFileSync(path, JSON.stringify({
      Users: [
        ['UserID', 'Name', 'Class', 'XP'],
        ['U1', 'Ada', 'ป.5', '120'],
      ],
      Settings: [
        ['Key', 'Value'],
        ['TimerPerQuestion', '30'],
      ],
    }))
    run(path)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function withExportJson(value: unknown, run: (path: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'nextgen-play-export-json-'))
  const path = join(dir, 'sheet-export.json')

  try {
    writeFileSync(path, JSON.stringify(value))
    run(path)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('import-firestore CLI', () => {
  it('runs a dry-run summary without Firebase credentials', () => {
    withSheetExport((path) => {
      const result = spawnSync(process.execPath, [scriptPath, path], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: '' },
        encoding: 'utf8',
      })

      expect(result.status).toBe(0)
      expect(result.stdout).toContain('Documents:')
      expect(result.stdout).toContain('users')
      expect(result.stdout).toContain('settings')
      expect(result.stdout).toContain('Dry run only')
      expect(result.stderr).toBe('')
    })
  })

  it('refuses --commit unless an explicit service-account key path is configured', () => {
    withSheetExport((path) => {
      const result = spawnSync(process.execPath, [scriptPath, path, '--commit'], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: '' },
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stdout).toContain('Documents:')
      expect(result.stderr).toContain('Refusing to commit without GOOGLE_APPLICATION_CREDENTIALS')
    })
  })

  it('refuses --commit when the configured service-account key path does not exist', () => {
    withSheetExport((path) => {
      const missingKeyPath = join(tmpdir(), `missing-service-account-${Date.now()}.json`)
      const result = spawnSync(process.execPath, [scriptPath, path, '--commit'], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: missingKeyPath },
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stdout).toContain('Documents:')
      expect(result.stderr).toContain(`Refusing to commit because GOOGLE_APPLICATION_CREDENTIALS does not point to an existing file: ${missingKeyPath}`)
    })
  })

  it('refuses --commit when the service-account key belongs to a different Firebase project', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nextgen-play-wrong-key-'))
    const keyPath = join(dir, 'service-account.json')

    try {
      writeFileSync(keyPath, JSON.stringify({
        type: 'service_account',
        project_id: 'other-project',
        client_email: 'firebase-adminsdk@example.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n',
      }))

      withSheetExport((path) => {
        const result = spawnSync(process.execPath, [scriptPath, path, '--commit'], {
          cwd: fileURLToPath(new URL('../', import.meta.url)),
          env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: keyPath },
          encoding: 'utf8',
        })

        expect(result.status).toBe(1)
        expect(result.stdout).toContain('Documents:')
        expect(result.stderr).toContain('Refusing to commit because service-account project_id "other-project" does not match nextgen-play-19dd2.')
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses --commit when the service-account key file is not valid JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nextgen-play-invalid-key-'))
    const keyPath = join(dir, 'service-account.json')

    try {
      writeFileSync(keyPath, 'not json')

      withSheetExport((path) => {
        const result = spawnSync(process.execPath, [scriptPath, path, '--commit'], {
          cwd: fileURLToPath(new URL('../', import.meta.url)),
          env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: keyPath },
          encoding: 'utf8',
        })

        expect(result.status).toBe(1)
        expect(result.stdout).toContain('Documents:')
        expect(result.stderr).toContain(`Refusing to commit because GOOGLE_APPLICATION_CREDENTIALS is not a valid service-account JSON file: ${keyPath}`)
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses --commit when the service-account key JSON is missing required credential fields', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nextgen-play-incomplete-key-'))
    const keyPath = join(dir, 'service-account.json')

    try {
      writeFileSync(keyPath, JSON.stringify({
        type: 'service_account',
        project_id: 'nextgen-play-19dd2',
      }))

      withSheetExport((path) => {
        const result = spawnSync(process.execPath, [scriptPath, path, '--commit'], {
          cwd: fileURLToPath(new URL('../', import.meta.url)),
          env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: keyPath },
          encoding: 'utf8',
        })

        expect(result.status).toBe(1)
        expect(result.stdout).toContain('Documents:')
        expect(result.stderr).toContain('Refusing to commit because GOOGLE_APPLICATION_CREDENTIALS is missing service-account fields: client_email, private_key.')
        expect(result.stderr).not.toContain('at JWT.fromJSON')
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('shows usage and exits non-zero without an input file', () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      encoding: 'utf8',
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Usage: npm run migrate -- <sheet-export.json> [--commit]')
  })

  it('refuses unknown command-line flags instead of silently running a dry-run', () => {
    withSheetExport((path) => {
      const result = spawnSync(process.execPath, [scriptPath, path, '--comit'], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Unknown option "--comit". Usage: npm run migrate -- <sheet-export.json> [--commit]')
      expect(result.stdout).not.toContain('Dry run only')
    })
  })

  it('refuses multiple input files instead of ignoring extra paths', () => {
    withSheetExport((firstPath) => {
      withSheetExport((secondPath) => {
        const result = spawnSync(process.execPath, [scriptPath, firstPath, secondPath], {
          cwd: fileURLToPath(new URL('../', import.meta.url)),
          encoding: 'utf8',
        })

        expect(result.status).toBe(1)
        expect(result.stderr).toContain('Expected exactly one sheet export input file. Usage: npm run migrate -- <sheet-export.json> [--commit]')
        expect(result.stdout).not.toContain('Dry run only')
      })
    })
  })

  it('refuses a missing sheet export input file with a friendly message', () => {
    const missingExportPath = join(tmpdir(), `missing-sheet-export-${Date.now()}.json`)
    const result = spawnSync(process.execPath, [scriptPath, missingExportPath], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      encoding: 'utf8',
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`Input sheet export file does not exist: ${missingExportPath}`)
  })

  it('refuses a sheet export input file that is not valid JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nextgen-play-invalid-export-'))
    const exportPath = join(dir, 'sheet-export.json')

    try {
      writeFileSync(exportPath, '{not json')
      const result = spawnSync(process.execPath, [scriptPath, exportPath], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain(`Input sheet export file is not valid JSON: ${exportPath}`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses a valid JSON input that is not a sheet export object', () => {
    withExportJson([], (path) => {
      const result = spawnSync(process.execPath, [scriptPath, path], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Input sheet export must be a JSON object keyed by legacy sheet names.')
    })
  })

  it('refuses a sheet export object with no recognized legacy sheets', () => {
    withExportJson({ UnknownSheet: [['ID'], ['1']] }, (path) => {
      const result = spawnSync(process.execPath, [scriptPath, path], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Input sheet export did not contain any recognized legacy sheets with importable rows.')
    })
  })

  it('refuses duplicate Firestore document IDs with a friendly migration error', () => {
    withExportJson({
      Users: [
        ['UserID', 'Name'],
        ['U/1', 'Ada'],
        ['U_1', 'Ben'],
      ],
    }, (path) => {
      const result = spawnSync(process.execPath, [scriptPath, path], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Input sheet export could not be mapped to Firestore documents:')
      expect(result.stderr).toContain('Duplicate Firestore document ID "U_1"')
      expect(result.stderr).not.toContain('at mapSheetExport')
    })
  })

  it('refuses legacy IDs that normalize to reserved Firestore document IDs before importing', () => {
    withExportJson({
      Users: [
        ['UserID', 'Name'],
        ['__bad__', 'Ada'],
      ],
    }, (path) => {
      const result = spawnSync(process.execPath, [scriptPath, path], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Input sheet export could not be mapped to Firestore documents:')
      expect(result.stderr).toContain('Invalid Firestore document ID "__bad__" while importing sheet "Users".')
    })
  })

  it('refuses non-numeric values in numeric legacy columns before importing', () => {
    withExportJson({
      Users: [
        ['UserID', 'Name', 'XP'],
        ['U1', 'Ada', 'not-a-number'],
      ],
    }, (path) => {
      const result = spawnSync(process.execPath, [scriptPath, path], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Input sheet export could not be mapped to Firestore documents:')
      expect(result.stderr).toContain('Invalid numeric value "not-a-number" in sheet "Users" column "XP" row 2.')
    })
  })

  it('refuses invalid boolean values in boolean legacy columns before importing', () => {
    withExportJson({
      Lessons: [
        ['LessonID', 'Title', 'IsActive'],
        ['L1', 'Internet Safety', 'YES'],
      ],
    }, (path) => {
      const result = spawnSync(process.execPath, [scriptPath, path], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Input sheet export could not be mapped to Firestore documents:')
      expect(result.stderr).toContain('Invalid boolean value "YES" in sheet "Lessons" column "IsActive" row 2. Use TRUE or FALSE.')
    })
  })

  it('refuses invalid JSON values in JSON legacy columns before importing', () => {
    withExportJson({
      Users: [
        ['UserID', 'Name', 'Inventory'],
        ['U1', 'Ada', '{broken'],
      ],
    }, (path) => {
      const result = spawnSync(process.execPath, [scriptPath, path], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Input sheet export could not be mapped to Firestore documents:')
      expect(result.stderr).toContain('Invalid JSON value in sheet "Users" column "Inventory" row 2.')
    })
  })

  it('refuses JSON values that parse to the wrong Firestore field type before importing', () => {
    withExportJson({
      Users: [
        ['UserID', 'Name', 'Inventory'],
        ['U1', 'Ada', '[]'],
      ],
    }, (path) => {
      const result = spawnSync(process.execPath, [scriptPath, path], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Input sheet export could not be mapped to Firestore documents:')
      expect(result.stderr).toContain('Invalid JSON type in sheet "Users" column "Inventory" row 2. Expected object.')
    })
  })

  it('refuses invalid inventory item counts before importing', () => {
    withExportJson({
      Users: [
        ['UserID', 'Name', 'Inventory'],
        ['U1', 'Ada', '{"potion":"many"}'],
      ],
    }, (path) => {
      const result = spawnSync(process.execPath, [scriptPath, path], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Input sheet export could not be mapped to Firestore documents:')
      expect(result.stderr).toContain('Invalid inventory count at sheet "Users" column "Inventory" row 2 key "potion". Expected a non-negative number.')
    })
  })

  it('refuses malformed matching pair JSON items before importing', () => {
    withExportJson({
      Questions: [
        ['QuestionID', 'LessonID', 'QuestionText', 'QuestionPattern', 'MatchingPairs'],
        ['Q1', 'L1', 'จับคู่ให้ถูก', 'matching', '["CPU"]'],
      ],
    }, (path) => {
      const result = spawnSync(process.execPath, [scriptPath, path], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Input sheet export could not be mapped to Firestore documents:')
      expect(result.stderr).toContain('Invalid matching pair at sheet "Questions" column "MatchingPairs" row 2 item 1. Expected an object with left and right values.')
    })
  })

  it('refuses a recognized legacy sheet that is not a two-dimensional table', () => {
    withExportJson({ Users: { UserID: 'U1', Name: 'Ada' } }, (path) => {
      const result = spawnSync(process.execPath, [scriptPath, path], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Recognized legacy sheet "Users" must be a two-dimensional array exported from Google Sheets.')
    })
  })

  it('refuses a recognized legacy sheet that is missing required ID headers', () => {
    withExportJson({
      Users: [
        ['Name', 'Class'],
        ['Ada', 'P5'],
      ],
    }, (path) => {
      const result = spawnSync(process.execPath, [scriptPath, path], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Recognized legacy sheet "Users" is missing required header "UserID".')
    })
  })

  it('refuses duplicate headers in a recognized legacy sheet before importing', () => {
    withExportJson({
      Users: [
        ['UserID', 'Name', 'Name'],
        ['U1', 'Ada', 'Overwritten'],
      ],
    }, (path) => {
      const result = spawnSync(process.execPath, [scriptPath, path], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Recognized legacy sheet "Users" contains duplicate header "Name".')
    })
  })

  it('accepts a duplicate trailing header when its column is empty', () => {
    withExportJson({
      Lessons: [
        ['LessonID', 'Title', 'Content', 'Content'],
        ['L1', 'Internet Safety', 'Lesson body'],
      ],
    }, (path) => {
      const result = spawnSync(process.execPath, [scriptPath, path], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        encoding: 'utf8',
      })

      expect(result.status).toBe(0)
      expect(result.stdout).toContain('lessons')
      expect(result.stderr).toBe('')
    })
  })
})
