const youtubeIdPattern = /^[a-zA-Z0-9_-]{11}$/

export function toLessonEmbedUrl(value?: string) {
  const input = value?.trim()
  if (!input) return ''

  try {
    const url = new URL(input)
    const host = url.hostname.replace(/^www\./, '')
    let videoId = ''

    if (host === 'youtu.be') videoId = url.pathname.split('/').filter(Boolean)[0] || ''
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      videoId = url.searchParams.get('v') || ''
      if (!videoId) {
        const [kind, id] = url.pathname.split('/').filter(Boolean)
        if (['embed', 'shorts', 'live'].includes(kind)) videoId = id || ''
      }
    }

    return youtubeIdPattern.test(videoId)
      ? `https://www.youtube.com/embed/${videoId}`
      : input
  } catch {
    return input
  }
}

export function isDirectLessonVideo(value?: string) {
  if (!value) return false
  try {
    return /\.(mp4|webm|ogg)$/i.test(new URL(value).pathname)
  } catch {
    return /\.(mp4|webm|ogg)(?:$|[?#])/i.test(value)
  }
}

export function toTrackedLessonEmbedUrl(value?: string, origin = '') {
  const embed = toLessonEmbedUrl(value)
  if (!embed || !embed.startsWith('https://www.youtube.com/embed/')) return embed
  const url = new URL(embed)
  url.searchParams.set('enablejsapi', '1')
  if (origin) url.searchParams.set('origin', origin)
  return url.toString()
}

export function hasTrackableLessonVideo(value?: string) {
  return isDirectLessonVideo(value) || toLessonEmbedUrl(value).startsWith('https://www.youtube.com/embed/')
}

export function lessonVideoMessageEnded(origin: string, data: unknown) {
  if (!/^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com$/.test(origin)) return false
  try {
    const payload = typeof data === 'string' ? JSON.parse(data) : data
    return Boolean(payload && typeof payload === 'object' && 'event' in payload && 'info' in payload
      && payload.event === 'onStateChange' && payload.info === 0)
  } catch {
    return false
  }
}
