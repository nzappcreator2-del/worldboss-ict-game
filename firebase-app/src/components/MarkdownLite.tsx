import { Fragment, type ReactNode } from 'react'

// Minimal, injection-safe markdown renderer for AI output (chat bubbles and
// teacher reports). Everything is emitted as React text nodes — never HTML —
// so model output cannot smuggle markup into the page.

function inline(text: string): ReactNode {
  return text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={index} className="rounded bg-black/10 px-1 text-[0.9em]">{part.slice(1, -1)}</code>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={index}>{part.slice(1, -1)}</em>
    return <Fragment key={index}>{part}</Fragment>
  })
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'numbers'; items: string[] }
  | { kind: 'note'; lines: string[] }
  | { kind: 'paragraph'; lines: string[] }

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd()
    const trimmed = line.trim()
    const last = blocks.at(-1)
    if (!trimmed) continue
    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] })
      continue
    }
    const bullet = trimmed.match(/^[-*•]\s+(.*)$/)
    if (bullet) {
      if (last?.kind === 'bullets') last.items.push(bullet[1])
      else blocks.push({ kind: 'bullets', items: [bullet[1]] })
      continue
    }
    const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/)
    if (numbered) {
      if (last?.kind === 'numbers') last.items.push(numbered[1])
      else blocks.push({ kind: 'numbers', items: [numbered[1]] })
      continue
    }
    const note = trimmed.match(/^>\s*(.*)$/)
    if (note) {
      if (last?.kind === 'note') last.lines.push(note[1])
      else blocks.push({ kind: 'note', lines: [note[1]] })
      continue
    }
    if (last?.kind === 'paragraph') last.lines.push(trimmed)
    else blocks.push({ kind: 'paragraph', lines: [trimmed] })
  }
  return blocks
}

export function MarkdownLite({ text, className = '' }: { text: string; className?: string }) {
  const blocks = parseBlocks(text)
  return (
    <div className={`space-y-2 ${className}`.trim()}>
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          const Tag = block.level <= 2 ? 'h3' : 'h4'
          return <Tag key={index} className={`font-black leading-snug ${block.level <= 2 ? 'mt-3 text-base' : 'mt-2 text-sm'}`}>{inline(block.text)}</Tag>
        }
        if (block.kind === 'bullets') {
          return <ul key={index} className="ml-4 list-disc space-y-1">{block.items.map((item, at) => <li key={at}>{inline(item)}</li>)}</ul>
        }
        if (block.kind === 'numbers') {
          return <ol key={index} className="ml-4 list-decimal space-y-1">{block.items.map((item, at) => <li key={at}>{inline(item)}</li>)}</ol>
        }
        if (block.kind === 'note') {
          return <blockquote key={index} className="rounded-r-lg border-l-4 border-amber-400 bg-amber-50/80 px-3 py-2 text-amber-900">{block.lines.map((line, at) => <p key={at}>{inline(line)}</p>)}</blockquote>
        }
        return <div key={index}>{block.lines.map((line, at) => <p key={at} className="leading-relaxed">{inline(line)}</p>)}</div>
      })}
    </div>
  )
}
