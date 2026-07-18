import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { prepareStandaloneGame } from './standaloneGame'

const legacyRoot = fileURLToPath(new URL('../../../legacy-gas/', import.meta.url))
const fitness = readFileSync(`${legacyRoot}fitness.html`, 'utf8')
const neckQuiz = readFileSync(`${legacyRoot}neck_quiz.html`, 'utf8')

describe('world boss standalone game sources', () => {
  it('keeps the postMessage bridge contract on the real fitness game', () => {
    const prepared = prepareStandaloneGame(fitness, 'fitness')
    expect(prepared).toContain('nextgen:world-boss-result')
    expect(prepared).not.toContain("urlParams.get('webAppUrl')")
    expect(fitness).toContain('id="wb-victory-modal"')
    expect(fitness).toContain('quizBonusCoins')
    expect(fitness).toContain('wbRepsCount')
    expect(fitness).toContain('wbElapsedTime')
  })

  it('runs the AI safety game on an uncapped rAF loop decoupled from hand inference', () => {
    // เรนเดอร์ลูปต้องไม่ถูกล็อกไว้ที่ 30 FPS อีกต่อไป
    expect(fitness).not.toContain('lastGameFrameTime >= 33.3')
    // เคอร์เซอร์มือถูกสมูทในเรนเดอร์ลูป (target แยกจาก smooth) ไม่ใช่ในคอลแบ็ก MediaPipe
    expect(fitness).toContain('handCursor.targetX')
    expect(fitness).toContain('handCursor.targetY')
    // จอกล้องจิ๋ววาดจากวิดีโอโดยตรงในเรนเดอร์ลูป ไม่ผูกกับอัตราเฟรมของโมเดล AI
    expect(fitness).toContain('drawWebcamPreview')
    // ป้องกันการส่งเฟรมซ้อนเข้าโมเดลระหว่างที่เฟรมก่อนหน้ายังประมวลผลไม่เสร็จ
    expect(fitness).toContain('aiInferenceBusy')
  })

  it('supports mouse and touch drag as a fallback for the AI safety game', () => {
    expect(fitness).toContain("addEventListener('pointerdown'")
    expect(fitness).toContain("addEventListener('pointermove'")
    expect(fitness).toContain("addEventListener('pointerup'")
    expect(fitness).toContain('pointerDragActive')
  })

  it('keeps the bridge contract and decoupled loops on the real neck quiz', () => {
    const prepared = prepareStandaloneGame(neckQuiz, 'neck-quiz')
    expect(prepared).toContain('nextgen:world-boss-result')
    expect(neckQuiz).toContain('id="victory-screen"')
    expect(neckQuiz).toContain('localBossId')
    // เรนเดอร์ลูป 60 FPS แยกจากลูปส่งเฟรมเข้าโมเดล Pose
    expect(neckQuiz).toContain('function startRenderLoop')
    expect(neckQuiz).toContain('poseInferenceBusy')
    // ระบบยืนยันคำตอบแบบเอียงค้าง (hold-to-confirm) เพื่อกันการตอบพลาด
    expect(neckQuiz).toContain('HOLD_TO_CONFIRM_MS')
  })
})
