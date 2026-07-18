import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { firestoreApi as typedFirestoreApi } from './firestoreApi'
import type { FirebaseServices } from './legacyRunner'

// The coverage checks index by arbitrary legacy method names, so use the
// loose service-record view of the precisely typed api object.
const firestoreApi: FirebaseServices = typedFirestoreApi

const legacyMethods = [
  'askNPCAi', 'buyItem', 'checkCertificateEligibility', 'claimLoginBonus', 'completeDailyQuest',
  'createOrJoinMatch', 'deleteAdminLesson', 'deleteNewsItem', 'deleteStudentData', 'finishMatch',
  'gachaAvatar', 'generateAIProgressReport', 'generateLessonAndQuizWithGemini',
  'getAdminQuestionsByLessonAndType', 'getAdminStudents', 'getAllNewsAdmin', 'getCyberSafetyScenarios',
  'getDailyQuestStatus', 'getGuildLeaderboard', 'getInitialData', 'getLeaderboard',
  'getLessons', 'getMatchStatus', 'getPreTestQuestions', 'getQuestions', 'getScriptUrl',
  'getStudentProfileData', 'getUserStats', 'getWorldBossConfig', 'getWorldBossLeaderboard',
  'getExamReports', 'leaveMatch', 'loginStudent', 'resetAllStudentData', 'resetStudentData',
  'saveAdminLesson', 'saveBatchQuestions', 'saveCyberSafetyResult', 'saveNewsItem', 'saveSettings',
  'saveStudentProgress', 'setPlayerReady', 'submitWorldBossScore', 'updateDailyProgress',
  'updateMatchScore', 'useItem', 'verifyAdminPin',
]

describe('legacy service coverage', () => {
  it.each(legacyMethods)('provides %s through Firebase services', (method) => {
    expect(firestoreApi[method]).toBeTypeOf('function')
  })

  it('covers every server method called by the authoritative legacy UI', () => {
    const legacyRoot = fileURLToPath(new URL('../../../legacy-gas/', import.meta.url))
    const files = readdirSync(legacyRoot)
    const serverSource = files.filter((name) => name.endsWith('.js'))
      .map((name) => readFileSync(`${legacyRoot}/${name}`, 'utf8')).join('\n')
    const clientSource = files.filter((name) => name.startsWith('JS_') && name.endsWith('.html'))
      .map((name) => readFileSync(`${legacyRoot}/${name}`, 'utf8')).join('\n')
    const serverMethods = [...serverSource.matchAll(/^function\s+([A-Za-z0-9_]+)/gm)].map((match) => match[1])
    const calledMethods = [...new Set(serverMethods.filter((name) => new RegExp(`\\.${name}\\s*\\(`).test(clientSource)))].sort()
    const missing = calledMethods.filter((name) => typeof firestoreApi[name] !== 'function')

    expect(calledMethods).toHaveLength(47)
    expect(missing).toEqual([])
  })
})
