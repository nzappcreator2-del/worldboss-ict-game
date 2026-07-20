import { useEffect, useMemo, useState } from 'react'
import { matchingAnswerIsCorrect, type MatchingPair } from './quizLogic'

export type QuizQuestion = {
  qId: string
  text: string
  options: unknown[]
  answer: number
  explanation?: string
  pattern?: string
  image?: string
  matchingPairs?: MatchingPair[]
}

type Props = {
  question: QuizQuestion
  disabled?: boolean
  hiddenChoices?: number[]
  variant?: 'default' | 'boss'
  onAnswer(correct: boolean): void
}

const labels = ['ก', 'ข', 'ค', 'ง']
const colors = ['bg-blue-500 hover:bg-blue-600', 'bg-green-500 hover:bg-green-600', 'bg-yellow-500 hover:bg-yellow-600', 'bg-red-500 hover:bg-red-600']

export function QuizQuestionView({ question, disabled = false, hiddenChoices = [], variant = 'default', onAnswer }: Props) {
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null)
  const [matches, setMatches] = useState<Record<string, string>>({})
  const pairs = useMemo(() => question.matchingPairs || [], [question.matchingPairs])

  useEffect(() => {
    setSelectedLeft(null)
    setMatches({})
  }, [question.qId])

  if ((question.pattern || 'choice') === 'matching') {
    const usedRight = new Set(Object.values(matches))
    return (
      <div className="flex flex-col gap-4 mt-auto">
        <div className="grid grid-cols-2 gap-4 md:gap-6">
          <div className="flex flex-col gap-3">
            {pairs.map((pair) => (
              <button key={pair.left} type="button" disabled={disabled} aria-pressed={selectedLeft === pair.left} onClick={() => setSelectedLeft(pair.left)} className={`w-full p-3 text-left border-2 rounded-xl font-bold bg-white ${selectedLeft === pair.left ? 'ring-4 ring-yellow-400 border-yellow-500' : 'border-gray-300'}`}>
                {pair.left}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            {pairs.map((pair) => (
              <button key={pair.right} type="button" disabled={disabled || !selectedLeft} onClick={() => {
                if (!selectedLeft) return
                setMatches((current) => {
                  const next = Object.fromEntries(Object.entries(current).filter(([left, right]) => left !== selectedLeft && right !== pair.right))
                  next[selectedLeft] = pair.right
                  return next
                })
                setSelectedLeft(null)
              }} className={`w-full p-3 text-left border-2 rounded-xl font-bold bg-white ${usedRight.has(pair.right) ? 'border-pink-500 bg-pink-50' : 'border-gray-300'}`}>
                {pair.right}
              </button>
            ))}
          </div>
        </div>
        <button type="button" disabled={disabled || Object.keys(matches).length < pairs.length} onClick={() => onAnswer(matchingAnswerIsCorrect(pairs, matches))} className="w-full max-w-xs mx-auto py-3 bg-gradient-to-r from-emerald-500 to-green-600 disabled:opacity-50 text-white font-bold rounded-2xl shadow-lg">
          ยืนยันการจับคู่
        </button>
      </div>
    )
  }

  return (
    <div data-testid={variant === 'boss' ? 'boss-quiz-choices' : undefined} className={`quiz-choice-grid grid grid-cols-1 md:grid-cols-2 gap-4 mt-auto ${variant === 'boss' ? 'boss-quiz-choices' : ''}`}>
      {question.options.slice(0, 4).map((option, index) => {
        if (hiddenChoices.includes(index)) return null
        const text = String(option ?? '').trim() || `ตัวเลือกสำรองที่ ${index + 1}`
        return (
          <button key={`${index}-${text}`} type="button" disabled={disabled} onClick={() => onAnswer(index === question.answer)} className={`quiz-choice-option p-4 ${colors[index % colors.length]} text-white rounded-2xl font-bold text-lg shadow-lg hover:scale-105 transition-all text-left flex items-center gap-3`}>
            <span className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-xl font-black">{labels[index] || index + 1}</span>
            <span className="quiz-choice-copy">{text}</span>
          </button>
        )
      })}
    </div>
  )
}
