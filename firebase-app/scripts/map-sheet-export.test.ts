import { describe, expect, it } from 'vitest'
import { mapSheetExport } from './map-sheet-export.mjs'

describe('mapSheetExport', () => {
  it('maps legacy rows to Firestore collections and keeps legacy IDs', () => {
    const mapped = mapSheetExport({
      Users: [
        ['UserID', 'Name', 'Class', 'XP', 'Rank', 'Level', 'Avatar', 'Coins', 'Inventory'],
        ['U1', 'Ada', 'ป.5', 350, 'SILVER', 4, '🧙', 20, '{"potion":2}'],
      ],
      Lessons: [
        ['LessonID', 'Title', 'Description', 'VideoURL', 'Icon', 'IsActive'],
        ['L1', 'Internet', 'Basics', '', '🌐', true],
      ],
      Settings: [['Key', 'Value'], ['TimerPerQuestion', '30'], ['Classes', 'ป.4,ป.5'], ['AdminPIN', '1234'], ['GeminiAPIKey', 'secret']],
    })

    expect(mapped.users.U1).toMatchObject({ name: 'Ada', class: 'ป.5', xp: 350, inventory: { potion: 2 } })
    expect(mapped.lessons.L1).toMatchObject({ lessonId: 'L1', title: 'Internet', isActive: true })
    expect(mapped.settings.public).toEqual({ TimerPerQuestion: 30, Classes: 'ป.4,ป.5' })
  })

  it('keeps only known public settings keys from legacy Settings sheets', () => {
    const mapped = mapSheetExport({
      Settings: [
        ['Key', 'Value'],
        ['TimerPerQuestion', '45'],
        ['Classes', 'P5,P6'],
        ['Rooms', '1,2'],
        ['CertHeader', 'Certificate'],
        ['CertFooter', 'ICT'],
        ['AdminPIN', '1234'],
        ['GeminiAPIKey', 'secret'],
        ['SecretWebhook', 'https://example.invalid'],
      ],
    })

    expect(mapped.settings.public).toEqual({
      TimerPerQuestion: 45,
      Classes: 'P5,P6',
      Rooms: '1,2',
      CertHeader: 'Certificate',
      CertFooter: 'ICT',
    })
  })

  it('maps transient PVP match rows to the React/Firestore realtime schema', () => {
    const mapped = mapSheetExport({
      PVP_Matches: [[
        'MatchID', 'Player1ID', 'Player2ID', 'Player1Name', 'Player2Name',
        'Player1Avatar', 'Player2Avatar', 'Player1Score', 'Player2Score',
        'Player1Ready', 'Player2Ready', 'Status', 'CreatedAt',
      ], [
        'M1', 'U1', 'U2', 'Ada', 'Ben', '🧙', '🛡️', '80', '65', 'TRUE', 'FALSE', 'FINISHED', '2026-06-30',
      ]],
    })

    expect(mapped.pvpMatches.M1).toMatchObject({
      matchId: 'M1',
      p1Id: 'U1',
      p2Id: 'U2',
      p1Name: 'Ada',
      p2Name: 'Ben',
      p1Avatar: '🧙',
      p2Avatar: '🛡️',
      p1Hp: 80,
      p2Hp: 65,
      p1Ready: true,
      p2Ready: false,
      status: 'FINISHED',
      createdAt: '2026-06-30',
    })
  })

  it('normalizes legacy PVP FINISHED ready markers to true', () => {
    const mapped = mapSheetExport({
      PVP_Matches: [
        ['MatchID', 'Player1Ready', 'Player2Ready', 'Status'],
        ['M1', 'FINISHED', 'FINISHED', 'FINISHED'],
      ],
    })

    expect(mapped.pvpMatches.M1).toMatchObject({ p1Ready: true, p2Ready: true, status: 'FINISHED' })
  })

  it('skips reusable private PVP room IDs from the legacy history', () => {
    const mapped = mapSheetExport({
      PVP_Matches: [
        ['MatchID', 'Status', 'CreatedAt'],
        ['PRIVATE_1234', 'CANCELLED', 1],
        ['PRIVATE_1234', 'FINISHED', 2],
      ],
    })

    expect(mapped.pvpMatches).toBeUndefined()
  })

  it('skips non-terminal legacy PVP rooms that cannot carry Firebase ownership', () => {
    const mapped = mapSheetExport({
      PVP_Matches: [
        ['MatchID', 'Status'],
        ['M1', 'PLAYING'],
        ['M2', 'LOBBY'],
        ['M3', 'FINISHED'],
      ],
    })

    expect(mapped.pvpMatches).toEqual({ M3: { matchId: 'M3', status: 'FINISHED' } })
  })

  it('creates deterministic progress IDs and parses booleans/numbers', () => {
    const mapped = mapSheetExport({
      Progress: [['UserID', 'LessonID', 'Status', 'Score'], ['U1', 'L1', 'Passed', '8']],
      News: [['NewsID', 'Title', 'IsActive'], ['N1', 'Hello', 'TRUE']],
    })

    expect(mapped.progress.U1_L1).toMatchObject({ userId: 'U1', lessonId: 'L1', score: 8 })
    expect(mapped.news.N1.isActive).toBe(true)
  })

  it('keeps the strongest result when legacy Progress contains repeated attempts', () => {
    const mapped = mapSheetExport({
      Progress: [
        ['UserID', 'LessonID', 'Status', 'Score'],
        ['U1', 'L1', 'Failed', '9'],
        ['U1', 'L1', 'Passed', '5'],
        ['U1', 'L1', 'Passed', '8'],
      ],
    })

    expect(mapped.progress.U1_L1).toMatchObject({ status: 'Passed', score: 8 })
  })

  it('normalizes imported ID fields to match Firestore-safe document IDs', () => {
    const mapped = mapSheetExport({
      Users: [['UserID', 'Name'], ['U/1', 'Ada']],
      Lessons: [['LessonID', 'Title'], ['L/1', 'Internet']],
      Questions: [['QuestionID', 'LessonID', 'QuestionText'], ['Q/1', 'L/1', 'Question']],
      Progress: [['UserID', 'LessonID', 'Status'], ['U/1', 'L/1', 'Passed']],
      WorldBoss_Scores: [['UserID', 'BossID', 'BestTimeSeconds'], ['U/1', 'WB/1', '12']],
    })

    expect(mapped.users.U_1).toMatchObject({ userId: 'U_1' })
    expect(mapped.lessons.L_1).toMatchObject({ lessonId: 'L_1' })
    expect(mapped.questions.Q_1).toMatchObject({ questionId: 'Q_1', lessonId: 'L_1' })
    expect(mapped.progress.U_1_L_1).toMatchObject({ userId: 'U_1', lessonId: 'L_1' })
    expect(mapped.worldBossScores.U_1_WB_1).toMatchObject({ userId: 'U_1', bossId: 'WB_1' })
  })

  it('keeps the best duplicate World Boss score using each boss scoring mode', () => {
    const mapped = mapSheetExport({
      WorldBoss_Scores: [
        ['UserID', 'BossID', 'BestTimeSeconds', 'Date'],
        ['U1', 'WB001', '42', '2026-01-01'],
        ['U1', 'WB001', '35', '2026-01-02'],
        ['U1', 'WB002', '8', '2026-01-01'],
        ['U1', 'WB002', '12', '2026-01-02'],
      ],
    })

    expect(mapped.worldBossScores.U1_WB001).toMatchObject({ bestTime: 35, date: '2026-01-02' })
    expect(mapped.worldBossScores.U1_WB002).toMatchObject({ bestTime: 12, date: '2026-01-02' })
  })

  it('normalizes Google Sheets date serials including Buddhist Era dates', () => {
    const mapped = mapSheetExport({
      News: [['NewsID', 'Date'], ['N1', 244451]],
      Users: [['UserID', 'LastLogin'], ['U1', 46183]],
      WorldBoss_Scores: [['UserID', 'BossID', 'BestTimeSeconds', 'Date'], ['U1', 'WB001', 6.27, 46165]],
      PVP_Matches: [['MatchID', 'Status', 'CreatedAt'], ['M1', 'FINISHED', 46183.5]],
    })

    expect(mapped.news.N1.date).toBe('2026-04-12')
    expect(mapped.users.U1.lastLogin).toBe('2026-06-10')
    expect(mapped.worldBossScores.U1_WB001.date).toBe('2026-05-23')
    expect(mapped.pvpMatches.M1.createdAt).toBe('2026-06-10T12:00:00.000Z')
  })

  it('ignores blank rows safely', () => {
    expect(mapSheetExport({ Users: [['UserID', 'Name'], ['', '']] })).toEqual({})
  })

  it('does not import Firebase Auth ownership fields from legacy Users sheets', () => {
    const mapped = mapSheetExport({
      Users: [
        ['UserID', 'Name', 'Class', 'ownerUid'],
        ['U1', 'Ada', 'ป.5', 'malicious-or-stale-auth-uid'],
      ],
    })

    expect(mapped.users.U1).toMatchObject({ userId: 'U1', name: 'Ada', class: 'ป.5' })
    expect(mapped.users.U1).not.toHaveProperty('ownerUid')
  })

  it('fails fast when legacy IDs would collide after Firestore-safe normalization', () => {
    expect(() => mapSheetExport({
      Users: [
        ['UserID', 'Name'],
        ['U/1', 'Ada'],
        ['U_1', 'Ben'],
      ],
    })).toThrow('Duplicate Firestore document ID "U_1"')
  })

  it('fails fast when legacy IDs normalize to invalid Firestore document IDs', () => {
    expect(() => mapSheetExport({
      Users: [
        ['UserID', 'Name'],
        ['.', 'Ada'],
      ],
    })).toThrow('Invalid Firestore document ID "." while importing sheet "Users".')
  })

  it('fails fast when a legacy sheet export contains duplicate headers', () => {
    expect(() => mapSheetExport({
      Users: [
        ['UserID', 'Name', 'Name'],
        ['U1', 'Ada', 'Overwritten'],
      ],
    })).toThrow('Duplicate header "Name" in sheet "Users".')
  })

  it('ignores a duplicate trailing header when the duplicate column is empty', () => {
    const mapped = mapSheetExport({
      Lessons: [
        ['LessonID', 'Title', 'Content', 'Content'],
        ['L1', 'Internet', 'Lesson body'],
        ['L2', 'Safety', 'Second body', ''],
      ],
    })

    expect(mapped.lessons.L1).toMatchObject({ lessonId: 'L1', content: 'Lesson body' })
    expect(mapped.lessons.L2).toMatchObject({ lessonId: 'L2', content: 'Second body' })
  })
})
