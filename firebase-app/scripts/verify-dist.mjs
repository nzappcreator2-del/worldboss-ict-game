import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultDistRoot = fileURLToPath(new URL('../dist/', import.meta.url))
export const MAX_JS_CHUNK_BYTES = 500 * 1024

const requiredFiles = [
  'index.html',
  'sw.js',
  'asset-warmup.json',
  'world-boss/fitness.html',
  'world-boss/neck_quiz.html',
]

const forbiddenFiles = [
  'fitness.html',
  'neck_quiz.html',
  'mario-game/index.html',
  'world-boss/mario-game/index.html',
]

const forbiddenPatterns = [
  /google\.script\.run/,
  /script\.google/,
  /Apps Script/,
  /Google Sheets/,
  /SpreadsheetApp/,
  /\bdoPost\b/,
  /\bdoGet\b/,
  /firebase-functions/,
  /functions\.https/,
  /httpsCallable/,
  /getFunctions/,
]

const binaryExtensions = new Set([
  '.apng', '.avif', '.eot', '.gif', '.ico', '.jpeg', '.jpg', '.mp3', '.mp4', '.ogg',
  '.otf', '.png', '.ttf', '.wav', '.webm', '.webp', '.woff', '.woff2',
])

const issues = []

function toLocalPath(path) {
  return path.split('/').join(sep)
}

function distPath(path) {
  return join(distRoot, toLocalPath(path))
}

function walkFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) return walkFiles(path)
    if (entry.isFile()) return [path]
    return []
  })
}

export function verifyDistribution(distRoot = defaultDistRoot) {
  const issues = []
  const distPath = (path) => join(distRoot, toLocalPath(path))

  if (!existsSync(distRoot) || !statSync(distRoot).isDirectory()) {
    issues.push('dist/ does not exist. Run npm run build before npm run verify:dist.')
  } else {
    for (const file of requiredFiles) {
      if (!existsSync(distPath(file))) {
        issues.push(`Missing required build artifact: ${file}`)
      }
    }

    const indexPath = distPath('index.html')
    if (existsSync(indexPath)) {
      const indexHtml = readFileSync(indexPath, 'utf8')
      if (indexHtml.includes('cdn.tailwindcss.com')) {
        issues.push('Production index.html must use the local CSS bundle instead of cdn.tailwindcss.com.')
      }
      const localStylesheet = [...indexHtml.matchAll(/href=["']([^"']+\.css(?:[?#][^"']*)?)["']/gi)]
        .map((match) => match[1])
        .find((href) => !/^https?:\/\//i.test(href))
      if (!localStylesheet) {
        issues.push('Production index.html does not reference a local CSS bundle.')
      } else {
        const stylesheetPath = localStylesheet.split(/[?#]/, 1)[0].replace(/^\.?\//, '')
        if (!existsSync(distPath(stylesheetPath))) {
          issues.push(`Production index.html references a missing local CSS bundle: ${stylesheetPath}`)
        }
      }
    }

    for (const file of forbiddenFiles) {
      if (existsSync(distPath(file))) {
        issues.push(`Unexpected build artifact is exposed: ${file}`)
      }
    }

    for (const file of walkFiles(distRoot)) {
      const extension = extname(file).toLowerCase()
      const relativeFile = relative(distRoot, file)

      if (extension === '.js' && statSync(file).size > MAX_JS_CHUNK_BYTES) {
        issues.push(`JavaScript chunk exceeds 500 KiB: ${relativeFile}`)
      }
      if (binaryExtensions.has(extension)) continue

      const text = readFileSync(file, 'utf8')
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(text)) {
          issues.push(`Forbidden legacy/server pattern ${pattern} found in ${relativeFile}`)
        }
      }
    }
  }

  return {
    issues,
    requiredCount: requiredFiles.length,
    forbiddenCount: forbiddenFiles.length,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = verifyDistribution()

  if (result.issues.length > 0) {
    console.error('Distribution verification failed:')
    for (const issue of result.issues) console.error(`- ${issue}`)
    process.exit(1)
  }

  console.log(`Distribution verification passed: ${result.requiredCount} required artifacts present, ${result.forbiddenCount} forbidden artifacts absent, no legacy GAS/Cloud Functions patterns found, no JavaScript chunk exceeds 500 KiB.`)
}
