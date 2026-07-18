const gasIncludePattern = /<\?!=?\s*include\(["'][^"']+["']\);?\s*\?>/g

export function extractLegacyBody(html: string): string {
  const match = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)
  if (!match) throw new Error('Legacy Index.html has no body')
  return match[1].replace(gasIncludePattern, '').trim()
}

export function stripHtmlTag(source: string, tag: 'script' | 'style'): string {
  const match = source.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return (match?.[1] ?? source).trim()
}

// The GAS page router hides every bare <section> and reveals the active page.
// React windows portaled to <body> (กระเป๋าไอเทม/ตู้เสื้อผ้า) render their own
// <section> elements, so the shipped rule must only target the legacy page
// shells — every one of which carries an id="page-*". The scoped selector is
// wrapped in :where() to keep specificity at zero (matching the original bare
// `section` selector's negligible specificity) — otherwise the added
// attribute selector out-specifies single-class rules like Tailwind's
// `.flex`/`.hidden`, which real pages (e.g. #page-dashboard) rely on to
// control their own display and would get stuck hidden.
export function migrateLegacyPageCss(source: string): string {
  return source.replace(
    /(^|[}/]|\*\/)(\s*)section(\s*\{|\.page-active\b)/g,
    (_match, boundary, spacing, tail) => {
      const scoped = tail.trimStart().startsWith('{')
        ? `:where(section[id^="page-"])${tail}`
        : `:where(section[id^="page-"]${tail})`
      return `${boundary}${spacing}${scoped}`
    },
  )
}

export function migrateLegacyBackendCalls(source: string): string {
  return source
    .replaceAll('google.script.run', 'firebaseServices')
    .replaceAll("typeof google !== 'undefined'", "typeof firebaseServices !== 'undefined'")
    .replaceAll("typeof google === 'undefined'", "typeof firebaseServices === 'undefined'")
    .replace(/google\.script\s*&&\s*firebaseServices/g, 'firebaseServices')
}

function elementRange(source: string, tag: string, elementId: string) {
  const escapedId = elementId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const openingPattern = new RegExp(`<${tag}\\b[^>]*\\bid=["']${escapedId}["'][^>]*>`, 'i')
  const opening = openingPattern.exec(source)
  if (!opening) throw new Error(`Legacy element #${elementId} was not found`)

  const tokenPattern = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi')
  tokenPattern.lastIndex = opening.index
  let depth = 0
  let closingIndex = -1
  let token: RegExpExecArray | null
  while ((token = tokenPattern.exec(source))) {
    const isClosing = token[0].startsWith('</')
    const isSelfClosing = token[0].endsWith('/>')
    if (isClosing) depth -= 1
    else if (!isSelfClosing) depth += 1
    if (depth === 0) {
      closingIndex = tokenPattern.lastIndex
      break
    }
  }
  if (closingIndex < 0) throw new Error(`Legacy element #${elementId} has no closing </${tag}>`)

  return { start: opening.index, end: closingIndex }
}

export function replaceElementWithPortal(source: string, tag: string, elementId: string, portalId: string): string {
  const range = elementRange(source, tag, elementId)
  return source.slice(0, range.start) + `<div id="${portalId}" class="contents"></div>` + source.slice(range.end)
}

export function removeElementById(source: string, tag: string, elementId: string): string {
  const range = elementRange(source, tag, elementId)
  return source.slice(0, range.start) + source.slice(range.end)
}
