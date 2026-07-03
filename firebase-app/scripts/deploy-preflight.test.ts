import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkDeployPreflight } from './deploy-preflight.mjs'

const roots: string[] = []

function tempProject() {
  const root = join(tmpdir(), `nextgen-preflight-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  roots.push(root)
  mkdirSync(join(root, 'firebase-app', 'src', 'firebase'), { recursive: true })
  writeFileSync(join(root, 'firestore.rules'), "rules_version = '2';")
  writeFileSync(join(root, 'firestore.indexes.json'), '{"indexes":[],"fieldOverrides":[]}')
  writeFileSync(join(root, '.firebaserc'), JSON.stringify({ projects: { default: 'nextgen-play-19dd2' } }))
  writeFileSync(join(root, 'firebase.json'), JSON.stringify({
    firestore: { rules: 'firestore.rules', indexes: 'firestore.indexes.json' },
    hosting: {
      public: 'firebase-app/dist',
      ignore: ['firebase.json', '**/.*', '**/node_modules/**'],
      predeploy: ['npm run verify'],
      rewrites: [{ source: '**', destination: '/index.html' }],
    },
  }))
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    scripts: { verify: 'npm --prefix firebase-app run verify', migrate: 'npm --prefix firebase-app run migrate --', preflight: 'npm --prefix firebase-app run preflight' },
    dependencies: {},
    devDependencies: {},
  }))
  writeFileSync(join(root, 'firebase-app', 'package.json'), JSON.stringify({
    scripts: { verify: 'npm run lint && npm run typecheck && npm test && npm run build', preflight: 'node scripts/deploy-preflight.mjs' },
    dependencies: { firebase: '^12.0.0', react: '^19.1.0' },
    devDependencies: { vite: '^7.0.0' },
  }))
  writeFileSync(join(root, 'firebase-app', 'src', 'firebase', 'config.ts'), [
    'export const firebaseConfig = {',
    "  projectId: 'nextgen-play-19dd2',",
    "  authDomain: 'nextgen-play-19dd2.firebaseapp.com',",
    '}',
  ].join('\n'))
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('checkDeployPreflight', () => {
  it('accepts a Hosting + Firestore-only deployment configuration', () => {
    const result = checkDeployPreflight(tempProject())

    expect(result.issues).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.checked).toContain('firebase.json')
    expect(result.checked).toContain('.firebaserc')
    expect(result.checked).toContain('firebase-app/src/firebase/config.ts')
  })

  it('rejects Cloud Functions deployment config or dependencies', () => {
    const root = tempProject()
    writeFileSync(join(root, 'firebase.json'), JSON.stringify({
      functions: { source: 'functions' },
      hosting: { public: 'dist' },
    }))
    writeFileSync(join(root, 'firebase-app', 'package.json'), JSON.stringify({
      scripts: { verify: 'npm test' },
      dependencies: { 'firebase-functions': '^6.0.0' },
      devDependencies: {},
    }))

    expect(checkDeployPreflight(root).issues).toEqual(expect.arrayContaining([
      'firebase.json must not define a functions block.',
      'firebase-app/package.json must not depend on firebase-functions.',
      'firebase.json hosting.public must be firebase-app/dist.',
    ]))
  })

  it('rejects project id drift between Firebase CLI and app config', () => {
    const root = tempProject()
    writeFileSync(join(root, '.firebaserc'), JSON.stringify({ projects: { default: 'other-project' } }))

    expect(checkDeployPreflight(root).issues).toContain(
      '.firebaserc default project must be nextgen-play-19dd2.',
    )
  })

  it('warns when the local Firebase deploy/import toolchain is not ready', () => {
    const result = checkDeployPreflight(tempProject(), {
      checkEnvironment: true,
      env: {},
      commandExists: () => false,
    })

    expect(result.issues).toEqual([])
    expect(result.warnings).toEqual(expect.arrayContaining([
      'Firebase CLI was not found on PATH; install firebase-tools before validating rules or deploying Hosting/Firestore.',
      'Java was not found on PATH; Firestore emulator rules validation will not run until Java is installed.',
      'GOOGLE_APPLICATION_CREDENTIALS is not set; Firestore import cannot be committed until a local service account key is provided.',
    ]))
  })
})
