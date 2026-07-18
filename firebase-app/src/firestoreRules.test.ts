import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

describe('Firestore security rules', () => {
  const rules = readFileSync(`${repoRoot}/firestore.rules`, 'utf8')

  it('checks the optional admin email claim without evaluation errors for anonymous users', () => {
    expect(rules).toContain("request.auth.token.get('email', '') == 'admin@nextgen-play.local'")
    expect(rules).not.toContain("request.auth.token.email == 'admin@nextgen-play.local'")
  })

  it('allows the first authenticated session to claim legacy imported users that do not yet have ownerUid', () => {
    expect(rules).toContain("!('ownerUid' in resource.data)")
    expect(rules).toContain('request.resource.data.ownerUid == request.auth.uid')
    expect(rules).toContain('resource.data.ownerUid == request.auth.uid')
  })

  it('limits student-owned user updates to expected profile and reward fields', () => {
    expect(rules).toContain('function userDocumentShapeValid()')
    expect(rules).toContain('function userChangedFieldsAllowed()')
    expect(rules).toContain("request.resource.data.keys().hasOnly(['userId', 'name', 'class', 'avatar', 'gender', 'xp', 'rank', 'level', 'coins', 'streak', 'inventory', 'ownerUid', 'createdAt', 'lastLogin'])")
    expect(rules).toContain("request.resource.data.diff(resource.data).affectedKeys().hasOnly(['avatar', 'xp', 'rank', 'level', 'coins', 'streak', 'inventory', 'ownerUid', 'lastLogin'])")
    expect(rules).toContain('&& userDocumentShapeValid()')
    expect(rules).toContain('&& userChangedFieldsAllowed()')
    // Gender is registration-only: valid values gated on create, and it stays
    // out of the update whitelist above so it can never change afterwards.
    expect(rules).toContain('function userGenderValid()')
    expect(rules).toContain("request.resource.data.gender in ['male', 'female']")
    expect(rules).toContain('&& userGenderValid()')
  })

  it('limits progress reads to admins or the owning student profile', () => {
    expect(rules).toContain('function progressDocumentShapeValid()')
    expect(rules).toContain('function progressValuesValid()')
    expect(rules).toContain('function progressChangedFieldsAllowed()')
    expect(rules).toContain("request.resource.data.keys().hasOnly(['userId', 'lessonId', 'status', 'score', 'maxScore', 'updatedAt'])")
    expect(rules).toContain("request.resource.data.status in ['Passed', 'Completed', 'Failed']")
    expect(rules).toContain("request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'score', 'maxScore', 'updatedAt'])")
    expect(rules).toContain('!exists(/databases/$(database)/documents/progress/$(progressId))')
    expect(rules).toContain('allow list: if admin() || ownsUser(resource.data.userId);')
    expect(rules).toContain("progressId == request.resource.data.userId + '_' + request.resource.data.lessonId;")
    expect(rules).toContain('allow create: if progressDocumentMatches(progressId)')
    expect(rules).toContain('resource.data.lessonId == request.resource.data.lessonId')
    expect(rules).toContain('&& progressDocumentShapeValid()')
    expect(rules).toContain('&& progressValuesValid()')
    expect(rules).toContain('&& progressChangedFieldsAllowed()')
    expect(rules).not.toContain('match /progress/{progressId} {\n      allow read: if signedIn();')
  })

  it('keeps PVP match identity fields stable after creation except for the intended second-player join', () => {
    expect(rules).toContain('function pvpPrimaryStable()')
    expect(rules).toContain('function pvpSecondPlayerStable()')
    expect(rules).toContain('function pvpSecondPlayerJoin()')
    expect(rules).toContain('function pvpInitialMatch(matchId)')
    expect(rules).toContain('function pvpPlayerOneOwnMutation()')
    expect(rules).toContain('function pvpPlayerTwoOwnMutation()')
    expect(rules).toContain('function pvpStatusConsistent()')
    expect(rules).toContain('function pvpDocumentShapeValid()')
    expect(rules).toContain('function pvpChangedFieldsAllowed()')
    expect(rules).toContain("request.resource.data.keys().hasOnly(['matchId', 'p1Uid', 'p2Uid', 'p1Id', 'p2Id', 'p1Name', 'p2Name', 'p1Avatar', 'p2Avatar', 'p1Hp', 'p2Hp', 'p1Ready', 'p2Ready', 'status', 'createdAt', 'updatedAt'])")
    expect(rules).toContain("request.resource.data.diff(resource.data).affectedKeys().hasOnly(['p2Uid', 'p2Id', 'p2Name', 'p2Avatar', 'p1Hp', 'p2Hp', 'p1Ready', 'p2Ready', 'status', 'updatedAt'])")
    expect(rules).toContain('allow create: if signedIn()\n        && pvpDocumentShapeValid()\n        && pvpInitialMatch(matchId);')
    expect(rules).toContain('&& pvpPrimaryStable()')
    expect(rules).toContain('&& (pvpSecondPlayerStable() || pvpSecondPlayerJoin())')
    expect(rules).toContain('&& pvpMutableValuesValid()')
    expect(rules).toContain('&& pvpStatusConsistent()')
    expect(rules).toContain('&& pvpDocumentShapeValid()')
    expect(rules).toContain('&& pvpChangedFieldsAllowed()')
    expect(rules).toContain('&& (pvpSecondPlayerJoin() || pvpPlayerOneOwnMutation() || pvpPlayerTwoOwnMutation())')
    expect(rules).toContain('resource.data.status == \'WAITING\'')
    expect(rules).toContain('resource.data.p2Uid == null')
    expect(rules).toContain('request.resource.data.p2Id == null')
    expect(rules).toContain('request.resource.data.p2Hp == 100')
    expect(rules).toContain('request.resource.data.p2Uid == request.auth.uid')
    expect(rules).toContain('request.resource.data.status == \'LOBBY\'')
    expect(rules).toContain('request.resource.data.p1Hp == resource.data.p1Hp')
  })

  it('prevents PVP players from mutating the opponent gameplay fields directly', () => {
    expect(rules).toContain('request.resource.data.p2Hp == resource.data.p2Hp')
    expect(rules).toContain('request.resource.data.p2Ready == resource.data.p2Ready')
    expect(rules).toContain('request.resource.data.p1Hp == resource.data.p1Hp')
    expect(rules).toContain('request.resource.data.p1Ready == resource.data.p1Ready')
  })

  it('keeps PVP status transitions consistent with gameplay state', () => {
    expect(rules).toContain("request.resource.data.status in ['WAITING', 'LOBBY']")
    expect(rules).toContain("request.resource.data.status == 'PLAYING'")
    expect(rules).toContain("request.resource.data.status == 'FINISHED'")
    expect(rules).toContain("request.resource.data.status == 'CANCELLED'")
    expect(rules).toContain('request.resource.data.p1Hp == 0')
    expect(rules).toContain('request.resource.data.p2Hp == 0')
    expect(rules).toContain("request.resource.data.p1Ready == 'FINISHED'")
    expect(rules).toContain("request.resource.data.p2Ready == 'FINISHED'")
  })

  it('keeps client-owned World Boss score documents on their deterministic user and boss ID', () => {
    expect(rules).toContain('function worldBossScoreDocumentShapeValid()')
    expect(rules).toContain('function worldBossScoreValuesValid()')
    expect(rules).toContain('function worldBossScoreChangedFieldsAllowed()')
    expect(rules).toContain("scoreId == request.resource.data.userId + '_' + request.resource.data.bossId;")
    expect(rules).toContain("request.resource.data.keys().hasOnly(['userId', 'bossId', 'name', 'className', 'class', 'bestTime', 'bestScore', 'bestTimeSeconds', 'date', 'ownerUid', 'updatedAt'])")
    expect(rules).toContain("request.resource.data.diff(resource.data).affectedKeys().hasOnly(['name', 'className', 'class', 'bestTime', 'bestScore', 'bestTimeSeconds', 'date', 'ownerUid', 'updatedAt'])")
    expect(rules).toContain('request.resource.data.bestTime <= 100000')
    expect(rules).toContain('allow create: if signedIn()\n        && worldBossScoreDocumentMatches(scoreId)')
    expect(rules).toContain('allow update: if signedIn()\n        && worldBossScoreDocumentMatches(scoreId)')
    expect(rules).toContain('resource.data.userId == request.resource.data.userId')
    expect(rules).toContain('resource.data.bossId == request.resource.data.bossId')
    expect(rules).toContain('&& worldBossScoreDocumentShapeValid()')
    expect(rules).toContain('&& worldBossScoreValuesValid()')
    expect(rules).toContain('&& worldBossScoreChangedFieldsAllowed()')
  })

  it('does not expose unauthenticated reads or writes in the rules file', () => {
    expect(rules).not.toMatch(/allow\s+(read|write|create|update|delete)[^:]*:\s*if\s+true/)
    expect(rules).not.toMatch(/allow\s+(read|write|create|update|delete)[^:]*:\s*if\s+request\.auth\s*==\s*null/)
  })
})
