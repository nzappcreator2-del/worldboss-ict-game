import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const defaultProjectRoot = fileURLToPath(new URL('../../', import.meta.url))
const expectedProjectId = 'nextgen-play-19dd2'
const forbiddenFunctionDependencies = new Set([
  'firebase-functions',
  '@google-cloud/functions-framework',
])

function readText(path, issues, checked) {
  if (!existsSync(path)) {
    issues.push(`Missing required file: ${path}`)
    return ''
  }
  checked.push(path)
  return readFileSync(path, 'utf8')
}

function readJson(root, relativePath, issues, checked) {
  const path = join(root, relativePath)
  const text = readText(path, issues, checked)
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    issues.push(`${relativePath} must be valid JSON.`)
    return null
  }
}

function hasScript(packageJson, scriptName) {
  return typeof packageJson?.scripts?.[scriptName] === 'string' && packageJson.scripts[scriptName].trim().length > 0
}

function dependencyNames(packageJson) {
  return new Set([
    ...Object.keys(packageJson?.dependencies || {}),
    ...Object.keys(packageJson?.devDependencies || {}),
  ])
}

function checkPackage(relativePath, packageJson, issues) {
  if (!packageJson) return

  for (const dependency of dependencyNames(packageJson)) {
    if (forbiddenFunctionDependencies.has(dependency)) {
      issues.push(`${relativePath} must not depend on ${dependency}.`)
    }
  }
}

function hasSpaRewrite(hosting) {
  return Array.isArray(hosting?.rewrites)
    && hosting.rewrites.some((rewrite) => rewrite?.source === '**' && rewrite?.destination === '/index.html')
}

function includesPredeployVerify(hosting) {
  return Array.isArray(hosting?.predeploy)
    && hosting.predeploy.includes('npm run verify')
}

function defaultCommandExists(command) {
  const locator = process.platform === 'win32' ? 'where' : 'which'
  const result = spawnSync(locator, [command], {
    stdio: 'ignore',
  })

  return !result.error && result.status === 0
}

function checkEnvironmentReadiness(warnings, env, commandExists) {
  if (!commandExists('firebase')) {
    warnings.push('Firebase CLI was not found on PATH; install firebase-tools before validating rules or deploying Hosting/Firestore.')
  }

  if (!commandExists('java')) {
    warnings.push('Java was not found on PATH; Firestore emulator rules validation will not run until Java is installed.')
  }

  if (typeof env.GOOGLE_APPLICATION_CREDENTIALS !== 'string' || env.GOOGLE_APPLICATION_CREDENTIALS.trim() === '') {
    warnings.push('GOOGLE_APPLICATION_CREDENTIALS is not set; Firestore import cannot be committed until a local service account key is provided.')
  }
}

export function checkDeployPreflight(projectRoot = defaultProjectRoot, options = {}) {
  const issues = []
  const warnings = []
  const checkedPaths = []
  const env = options.env || process.env
  const commandExists = options.commandExists || defaultCommandExists

  const firebaseJson = readJson(projectRoot, 'firebase.json', issues, checkedPaths)
  const firebaserc = readJson(projectRoot, '.firebaserc', issues, checkedPaths)
  const rootPackage = readJson(projectRoot, 'package.json', issues, checkedPaths)
  const appPackage = readJson(projectRoot, 'firebase-app/package.json', issues, checkedPaths)
  const configText = readText(join(projectRoot, 'firebase-app/src/firebase/config.ts'), issues, checkedPaths)

  if (!existsSync(join(projectRoot, 'firestore.rules'))) {
    issues.push('Missing required file: firestore.rules')
  } else {
    checkedPaths.push(join(projectRoot, 'firestore.rules'))
  }

  if (!existsSync(join(projectRoot, 'firestore.indexes.json'))) {
    issues.push('Missing required file: firestore.indexes.json')
  } else {
    checkedPaths.push(join(projectRoot, 'firestore.indexes.json'))
  }

  if (firebaseJson) {
    if ('functions' in firebaseJson) {
      issues.push('firebase.json must not define a functions block.')
    }
    if (firebaseJson.firestore?.rules !== 'firestore.rules') {
      issues.push('firebase.json firestore.rules must be firestore.rules.')
    }
    if (firebaseJson.firestore?.indexes !== 'firestore.indexes.json') {
      issues.push('firebase.json firestore.indexes must be firestore.indexes.json.')
    }
    if (firebaseJson.hosting?.public !== 'firebase-app/dist') {
      issues.push('firebase.json hosting.public must be firebase-app/dist.')
    }
    if (!includesPredeployVerify(firebaseJson.hosting)) {
      issues.push('firebase.json hosting.predeploy must include npm run verify.')
    }
    if (!hasSpaRewrite(firebaseJson.hosting)) {
      issues.push('firebase.json hosting.rewrites must route ** to /index.html.')
    }
  }

  if (firebaserc?.projects?.default !== expectedProjectId) {
    issues.push(`.firebaserc default project must be ${expectedProjectId}.`)
  }

  if (configText) {
    if (!configText.includes(`projectId: '${expectedProjectId}'`) && !configText.includes(`projectId: "${expectedProjectId}"`)) {
      issues.push(`firebase-app/src/firebase/config.ts projectId must be ${expectedProjectId}.`)
    }
    if (/privateKey|clientEmail/.test(configText)) {
      issues.push('firebase-app/src/firebase/config.ts must not contain service-account secrets.')
    }
  }

  checkPackage('package.json', rootPackage, issues)
  checkPackage('firebase-app/package.json', appPackage, issues)

  if (rootPackage) {
    for (const scriptName of ['verify', 'migrate', 'preflight']) {
      if (!hasScript(rootPackage, scriptName)) {
        issues.push(`package.json must define npm run ${scriptName}.`)
      }
    }
  }

  if (appPackage) {
    for (const scriptName of ['verify', 'preflight']) {
      if (!hasScript(appPackage, scriptName)) {
        issues.push(`firebase-app/package.json must define npm run ${scriptName}.`)
      }
    }
  }

  if (options.checkEnvironment) {
    checkEnvironmentReadiness(warnings, env, commandExists)
  }

  return {
    issues,
    warnings,
    checked: checkedPaths.map((path) => path.replace(projectRoot, '').replace(/^[\\/]/, '').split('\\').join('/')),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = checkDeployPreflight(defaultProjectRoot, { checkEnvironment: true })

  if (result.issues.length > 0) {
    console.error('Deploy preflight failed:')
    for (const issue of result.issues) console.error(`- ${issue}`)
    if (result.warnings.length > 0) {
      console.warn('Deploy preflight warnings:')
      for (const warning of result.warnings) console.warn(`- ${warning}`)
    }
    process.exit(1)
  }

  if (result.warnings.length > 0) {
    console.warn('Deploy preflight warnings:')
    for (const warning of result.warnings) console.warn(`- ${warning}`)
  }

  console.log(`Deploy preflight passed: ${result.checked.length} files checked, Firebase Hosting + Firestore only, no Cloud Functions configuration detected.`)
}
