// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PvpMode, type PvpArenaService, type PvpModeUser } from './PvpMode'
import type { PvpRoomView } from '../services/pvpRoomApi'
import { buildPvpPlayer, PVP_COUNTDOWN_SECONDS } from './pvpRoomLogic'
import type { QuizQuestion } from './QuizQuestionView'
import * as gameAudio from '../services/gameAudio'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const me: PvpModeUser = {
  id: 'u1',
  name: 'ฟ้า',
  avatar: '🧙',
  class: 'ป.5',
  gender: 'male',
  level: 5,
  xp: 500,
  inventory: { stats: { str: 4, vit: 2, dex: 0, luk: 0 } },
}

const questions: QuizQuestion[] = [
  { qId: 'q1', text: 'ข้อหนึ่ง', options: ['ผิดหนึ่ง', 'ถูกหนึ่ง'], answer: 1 },
  { qId: 'q2', text: 'ข้อสอง', options: ['ถูกสอง', 'ผิดสอง'], answer: 0 },
]

const baseRoom = (): PvpRoomView => {
  const p1 = { ...buildPvpPlayer(me, 'uid-1', 0), ready: false }
  const p2 = { ...buildPvpPlayer({ id: 'u2', name: 'เมฆ', avatar: '🧛' }, 'uid-2', 1), ready: false }
  return {
    roomId: 'room-1',
    mode: 'duel',
    teamSize: 1,
    isPrivate: false,
    hostId: 'u1',
    hostUid: 'uid-1',
    status: 'LOBBY',
    memberUids: ['uid-1', 'uid-2'],
    players: { u1: p1, u2: p2 },
    battle: null,
    winnerTeam: null,
    roundStartAtMs: Date.now(),
    updatedAtMs: Date.now(),
  }
}

const playingRoom = (round = 1): PvpRoomView => {
  const room = baseRoom()
  return {
    ...room,
    status: 'PLAYING',
    players: {
      u1: { ...room.players.u1, ready: true },
      u2: { ...room.players.u2, ready: true },
    },
    battle: { round, questionIds: ['q1', 'q2'], lastAction: null },
  }
}

function setup() {
  let roomSubscriber: ((room: PvpRoomView) => void) | undefined
  const service: PvpArenaService = {
    getCurrentUser: () => me,
    getRankings: vi.fn().mockResolvedValue({
      success: true,
      data: [{ userId: 'u9', name: 'แชมป์', avatar: '🏆', level: 9, class: 'ป.6', wins: 12, losses: 1, rating: 300, matches: 13 }],
    }),
    quickJoin: vi.fn().mockResolvedValue({ success: true, roomId: 'room-1' }),
    joinPrivate: vi.fn().mockResolvedValue({ success: true, roomId: 'room-1' }),
    subscribeRoom: vi.fn((_id, onData) => { roomSubscriber = onData; return vi.fn() }),
    leaveRoom: vi.fn().mockResolvedValue({ success: true }),
    setReady: vi.fn().mockResolvedValue({ success: true }),
    switchTeam: vi.fn().mockResolvedValue({ success: true }),
    setTeamSize: vi.fn().mockResolvedValue({ success: true }),
    startBattle: vi.fn().mockResolvedValue({ success: true }),
    answerRound: vi.fn().mockResolvedValue({ success: true, struck: true }),
    timeoutRound: vi.fn().mockResolvedValue({ success: true }),
    loadQuestions: vi.fn().mockResolvedValue({ success: true, data: questions }),
    sendChat: vi.fn().mockResolvedValue({ success: true }),
    subscribeChat: vi.fn(() => vi.fn()),
    updatePresence: vi.fn().mockResolvedValue(undefined),
    subscribePresence: vi.fn(() => vi.fn()),
    submitRanking: vi.fn().mockResolvedValue({ success: true }),
    grantReward: vi.fn().mockResolvedValue({ success: true }),
  }
  const onExit = vi.fn()
  render(<PvpMode service={service} onExit={onExit} />)
  act(() => { window.dispatchEvent(new Event('nextgen:open-pvp')) })
  return {
    service,
    onExit,
    emit: (room: PvpRoomView) => act(() => { roomSubscriber?.(room) }),
  }
}

async function enterLobby(context: ReturnType<typeof setup>) {
  fireEvent.click(await screen.findByRole('button', { name: /จับคู่สาธารณะ/ }))
  await waitFor(() => expect(context.service.subscribeRoom).toHaveBeenCalled())
  context.emit(baseRoom())
}

describe('PvpMode select screen', () => {
  it('stays visible above the legacy shell and shows both battle modes plus rankings', async () => {
    setup()
    const page = document.getElementById('page-pvp')
    expect(page?.classList.contains('pointer-events-auto')).toBe(true)
    expect(page?.classList.contains('z-[60]')).toBe(true)
    expect(await screen.findByText('ท้าดวล 1v1')).toBeTruthy()
    expect(screen.getByText('ศึกทีม Multiplayer')).toBeTruthy()
    expect(await screen.findByText('แชมป์')).toBeTruthy() // ranking row
  })

  it('uses the selected team size when creating a private multiplayer room', async () => {
    const { service } = setup()
    fireEvent.click(await screen.findByText('ศึกทีม Multiplayer'))
    fireEvent.click(screen.getByRole('button', { name: '3 vs 3' }))
    fireEvent.change(screen.getByPlaceholderText(/รหัสห้อง/), { target: { value: 'team3' } })
    fireEvent.click(screen.getByRole('button', { name: /เข้าห้องส่วนตัว/ }))
    await waitFor(() => expect(service.joinPrivate).toHaveBeenCalledWith(me, 'team', 3, 'TEAM3'))
  })

  it('rejects malformed private codes before touching the network', async () => {
    const { service } = setup()
    fireEvent.change(await screen.findByPlaceholderText(/รหัสห้อง/), { target: { value: 'AB' } })
    fireEvent.click(screen.getByRole('button', { name: /เข้าห้องส่วนตัว/ }))
    expect(await screen.findByText(/4-8 ตัว/)).toBeTruthy()
    expect(service.joinPrivate).not.toHaveBeenCalled()
  })

  it('joins a private team room with a sanitized code', async () => {
    const { service } = setup()
    fireEvent.change(await screen.findByPlaceholderText(/รหัสห้อง/), { target: { value: 'abcd12' } })
    fireEvent.click(screen.getByRole('button', { name: /เข้าห้องส่วนตัว/ }))
    await waitFor(() => expect(service.joinPrivate).toHaveBeenCalledWith(me, 'team', 2, 'ABCD12'))
  })
})

describe('PvpMode lobby', () => {
  it('shows both players, chat, and the ready flow', async () => {
    const context = setup()
    await enterLobby(context)
    expect((await screen.findAllByText(/เมฆ/)).length).toBeGreaterThan(0)
    expect(context.service.subscribeChat).toHaveBeenCalledWith('room-1', expect.any(Function))
    expect(context.service.subscribePresence).toHaveBeenCalledWith('room-1', expect.any(Function))

    fireEvent.click(screen.getByRole('button', { name: /ฉันพร้อมแล้ว/ }))
    await waitFor(() => expect(context.service.setReady).toHaveBeenCalledWith('room-1', 'u1', true))
  })

  it('lets the host start only when everyone is ready', async () => {
    const context = setup()
    await enterLobby(context)
    const startButton = await screen.findByRole('button', { name: /เริ่มการต่อสู้/ })
    expect((startButton as HTMLButtonElement).disabled).toBe(true)

    const ready = baseRoom()
    ready.players.u1.ready = true
    ready.players.u2.ready = true
    context.emit(ready)
    await waitFor(() => expect((screen.getByRole('button', { name: /เริ่มการต่อสู้/ }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /เริ่มการต่อสู้/ }))
    await waitFor(() => expect(context.service.startBattle).toHaveBeenCalledWith('room-1', 'u1', ['q1', 'q2']))
  })

  it('sends chat messages from the lobby', async () => {
    const context = setup()
    await enterLobby(context)
    fireEvent.change(await screen.findByPlaceholderText(/พิมพ์คุยกับเพื่อน/), { target: { value: 'สวัสดี' } })
    fireEvent.click(screen.getByRole('button', { name: /ส่ง/ }))
    await waitFor(() => expect(context.service.sendChat).toHaveBeenCalledWith('room-1', me, 'สวัสดี'))
  })

  it('leaves the room and returns to mode select', async () => {
    const context = setup()
    await enterLobby(context)
    fireEvent.click(await screen.findByRole('button', { name: /ออกจากห้อง/ }))
    await waitFor(() => expect(context.service.leaveRoom).toHaveBeenCalledWith('room-1', 'u1'))
    expect(await screen.findByText('ท้าดวล 1v1')).toBeTruthy()
  })
})

describe('PvpMode battle', () => {
  it('plays a professional countdown before revealing round 1', async () => {
    const context = setup()
    await enterLobby(context)
    vi.useFakeTimers()
    context.emit(playingRoom(1))
    expect(screen.getByText(/เตรียมตัว/)).toBeTruthy()
    expect(screen.queryByText('ข้อหนึ่ง')).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync((PVP_COUNTDOWN_SECONDS + 1) * 1000) })
    expect(screen.getByText('ข้อหนึ่ง')).toBeTruthy()
  })

  it('submits the round to the arbiter only on a correct answer', async () => {
    const context = setup()
    await enterLobby(context)
    context.emit(playingRoom(2)) // round > 1 skips the opening countdown
    expect(await screen.findByText('ข้อสอง')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /ผิดสอง/ }))
    expect(context.service.answerRound).not.toHaveBeenCalled()
    expect(await screen.findByText(/ตอบผิด/)).toBeTruthy()

    context.emit({ ...playingRoom(3), battle: { round: 3, questionIds: ['q1', 'q2'], lastAction: null } })
    expect(await screen.findByText('ข้อหนึ่ง')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /ถูกหนึ่ง/ }))
    await waitFor(() => expect(context.service.answerRound).toHaveBeenCalledWith('room-1', 'u1', 3))
  })

  it('announces the strike from the shared battle log', async () => {
    const playSword = vi.spyOn(gameAudio, 'playSwordHit')
    const context = setup()
    await enterLobby(context)
    const room = playingRoom(2)
    room.battle = {
      round: 2,
      questionIds: ['q1', 'q2'],
      lastAction: { round: 1, attackerId: 'u1', targetId: 'u2', damage: 19, crit: true, defeated: false },
    }
    context.emit(room)
    expect((await screen.findAllByText(/-19/)).length).toBeGreaterThan(0)
    expect(playSword).toHaveBeenCalledOnce()
    expect(screen.getAllByText(/คริติคอล|CRITICAL/i).length).toBeGreaterThan(0)
  })

  it('shows the result summary with MVP and records ranking + rewards once', async () => {
    const context = setup()
    await enterLobby(context)
    const finished = playingRoom(4)
    finished.status = 'FINISHED'
    finished.winnerTeam = 0
    finished.players.u1 = { ...finished.players.u1, damageDealt: 120, kills: 1, answersWon: 3 }
    finished.players.u2 = { ...finished.players.u2, hp: 0 }
    context.emit(finished)

    expect(await screen.findByText(/ชัยชนะ/)).toBeTruthy()
    expect(screen.getByText('MVP')).toBeTruthy()
    await waitFor(() => expect(context.service.submitRanking).toHaveBeenCalledWith(me, 'win'))
    await waitFor(() => expect(context.service.grantReward).toHaveBeenCalledWith('u1', expect.any(Number), expect.any(Number)))

    context.emit({ ...finished })
    await waitFor(() => expect(context.service.submitRanking).toHaveBeenCalledTimes(1))
  })
})
