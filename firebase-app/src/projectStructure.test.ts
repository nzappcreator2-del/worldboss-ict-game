import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isWorldBossAssetPath } from '../vite.config'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const appRoot = fileURLToPath(new URL('../', import.meta.url))

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

describe('Firebase migration project structure', () => {
  it('keeps the authoritative GAS snapshot under legacy-gas and builds legacy assets from there', () => {
    const viteConfig = readFileSync(`${appRoot}/vite.config.ts`, 'utf8')

    expect(existsSync(`${repoRoot}/legacy-gas/Index.html`)).toBe(true)
    expect(existsSync(`${repoRoot}/legacy-gas/JS_Auth.html`)).toBe(true)
    expect(existsSync(`${repoRoot}/legacy-gas/ExportForFirestore.js`)).toBe(true)
    expect(viteConfig).toContain("new URL('../legacy-gas/'")
    expect(viteConfig).not.toContain("new URL('../Index.html'")
  })

  it('targets Firebase Hosting + Firestore only, without Cloud Functions deploy targets', () => {
    const firebaseConfig = readJson(`${repoRoot}/firebase.json`)
    const projectConfig = readJson(`${repoRoot}/.firebaserc`)
    const firestoreIndexes = readJson(`${repoRoot}/firestore.indexes.json`)
    const deploymentRunbook = readFileSync(`${repoRoot}/DEPLOYMENT.md`, 'utf8')

    expect(firebaseConfig).toMatchObject({
      firestore: { rules: 'firestore.rules', indexes: 'firestore.indexes.json' },
      hosting: {
        public: 'firebase-app/dist',
        predeploy: ['npm run preflight', 'npm run verify'],
        rewrites: [{ source: '**', destination: '/index.html' }],
      },
    })
    expect(firebaseConfig).not.toHaveProperty('functions')
    expect(projectConfig).toMatchObject({ projects: { default: 'nextgen-play-19dd2' } })
    expect(firestoreIndexes.indexes).toContainEqual({
      collectionGroup: 'users',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'name', order: 'ASCENDING' },
        { fieldPath: 'class', order: 'ASCENDING' },
      ],
    })
    expect(deploymentRunbook).toContain('npm run preflight')
    expect(deploymentRunbook).toContain('npm run verify')
    expect(deploymentRunbook).toContain('npm run migrate -- path/to/sheet-export.json')
    expect(deploymentRunbook).toContain('npm run migrate -- path/to/sheet-export.json --commit')
    expect(deploymentRunbook).toContain('firebase deploy --only hosting,firestore:rules,firestore:indexes')
    expect(deploymentRunbook).not.toContain('firebase deploy --only functions')
  })

  it('keeps root npm scripts pointed at the React/Firebase app instead of legacy clasp tooling', () => {
    const rootPackage = readJson(`${repoRoot}/package.json`)
    const appPackage = readJson(`${appRoot}/package.json`)
    const gitignore = readFileSync(`${repoRoot}/.gitignore`, 'utf8')

    expect(rootPackage).toMatchObject({
      private: true,
      scripts: {
        postinstall: 'npm run install:app',
        'install:app': 'npm --prefix firebase-app install',
        dev: 'npm --prefix firebase-app run dev',
        build: 'npm --prefix firebase-app run build',
        test: 'npm --prefix firebase-app test -- --run',
        lint: 'npm --prefix firebase-app run lint',
        typecheck: 'npm --prefix firebase-app run typecheck',
        'audit:prod': 'npm --prefix firebase-app run audit:prod',
        preflight: 'npm --prefix firebase-app run preflight',
        'verify:dist': 'npm --prefix firebase-app run verify:dist',
        verify: 'npm --prefix firebase-app run verify',
        migrate: 'npm --prefix firebase-app run migrate --',
      },
    })
    expect(appPackage).toMatchObject({
      scripts: {
        preflight: 'node scripts/deploy-preflight.mjs',
        'verify:dist': 'node scripts/verify-dist.mjs',
        verify: 'npm run lint && npm run typecheck && npm test && npm run audit:prod && npm run build && npm run verify:dist',
      },
    })
    expect(rootPackage).not.toHaveProperty('devDependencies.@google/clasp')
    expect(gitignore).toContain('.env.local')
    expect(gitignore).toContain('service-account*.json')
    expect(gitignore).toContain('*firebase-adminsdk*.json')
    expect(gitignore).toContain('sheet-export*.json')
    expect(gitignore).toContain('firestore-export*.json')
  })

  it('does not copy Vite public assets to root where legacy game pages could bypass React routing', () => {
    const viteConfig = readFileSync(`${appRoot}/vite.config.ts`, 'utf8')

    expect(viteConfig).toContain('publicDir: false')
    expect(viteConfig).toContain("return 'react-vendor'")
    expect(viteConfig).toContain("return 'firebase-vendor'")
    expect(viteConfig).toContain("fileName: `world-boss/${fileName}`")
    expect(viteConfig).toContain("fileName: `world-boss/mario-game/${name}`")
    expect(isWorldBossAssetPath('fitness.html')).toBe(true)
    expect(isWorldBossAssetPath('neck_quiz.html')).toBe(true)
    expect(isWorldBossAssetPath('mario-game/index.html')).toBe(true)
    expect(isWorldBossAssetPath('mario-game/css/game.css')).toBe(true)
    expect(isWorldBossAssetPath('mario-game/README.md')).toBe(false)
    expect(isWorldBossAssetPath('mario-game/.gitignore')).toBe(false)
    expect(isWorldBossAssetPath('mario-game/todo.txt')).toBe(false)
    expect(isWorldBossAssetPath('mario-game/js/outline.txt')).toBe(false)
  })

  it('builds Tailwind utilities locally for both React and preserved legacy UI sources', () => {
    const index = readFileSync(`${appRoot}/index.html`, 'utf8')
    const main = readFileSync(`${appRoot}/src/main.tsx`, 'utf8')
    const tailwindConfig = readFileSync(`${appRoot}/tailwind.config.cjs`, 'utf8')
    const appPackage = readJson(`${appRoot}/package.json`)

    expect(index).not.toContain('cdn.tailwindcss.com')
    expect(main).toContain("import './index.css'")
    expect(tailwindConfig).toContain("'./src/**/*.{js,ts,jsx,tsx}'")
    expect(tailwindConfig).toContain("'../legacy-gas/**/*.{html,js}'")
    expect(appPackage).toHaveProperty('devDependencies.tailwindcss')
    expect(appPackage).toHaveProperty('devDependencies.postcss')
    expect(appPackage).toHaveProperty('devDependencies.autoprefixer')
  })

  it('does not leave duplicate GAS app files at the repository root', () => {
    const legacyRootFiles = [
      '.clasp.json', '.claspignore', 'Admin.js', 'API.js', 'appsscript.json', 'Code.js', 'Code_PVP.js',
      'CSS.html', 'fitness.html', 'Index.html', 'JS_Admin.html', 'JS_AITutor.html', 'JS_Auth.html',
      'JS_Battle.html', 'JS_CyberSafety.html', 'JS_DailyQuest.html', 'JS_Fitness.html', 'JS_Map.html',
      'JS_Profile.html', 'JS_PVP.html', 'JS_Utils.html', 'neck_quiz.html',
    ]

    expect(legacyRootFiles.filter((name) => existsSync(`${repoRoot}/${name}`))).toEqual([])
    expect(existsSync(`${repoRoot}/mario-game`)).toBe(false)
  })
})
