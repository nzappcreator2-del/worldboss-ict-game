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
