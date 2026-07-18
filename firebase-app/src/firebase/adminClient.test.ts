import { beforeEach, describe, expect, it, vi } from 'vitest'

const signIn = vi.fn()
const signOutMock = vi.fn()
const setPersistenceMock = vi.fn()
const auth = { currentUser: null as { email?: string } | null }

vi.mock('firebase/app', () => ({
  getApp: vi.fn(() => ({ name: 'nextgen-admin' })),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({ name: 'nextgen-admin' })),
}))

vi.mock('firebase/auth', () => ({
  browserSessionPersistence: 'browser-session',
  getAuth: vi.fn(() => auth),
  setPersistence: setPersistenceMock,
  signInWithEmailAndPassword: signIn,
  signOut: signOutMock,
}))

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({ kind: 'admin-db' })),
}))

describe('adminClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    auth.currentUser = null
    setPersistenceMock.mockResolvedValue(undefined)
    signIn.mockImplementation(async () => {
      auth.currentUser = { email: 'admin@nextgen-play.local' }
      return { user: auth.currentUser }
    })
    signOutMock.mockResolvedValue(undefined)
  })

  it('signs in once and then reuses the live Firebase session instead of re-sending the password', async () => {
    const { ensureAdminSession } = await import('./adminClient')

    await ensureAdminSession('secret-password')
    await ensureAdminSession('secret-password')
    await ensureAdminSession('')

    expect(setPersistenceMock).toHaveBeenCalledWith(auth, 'browser-session')
    expect(signIn).toHaveBeenCalledTimes(1)
    expect(signIn).toHaveBeenCalledWith(auth, 'admin@nextgen-play.local', 'secret-password')
  })

  it('rejects a non-admin session instead of silently reusing it', async () => {
    const { ensureAdminSession } = await import('./adminClient')
    auth.currentUser = { email: 'someone@else.local' }

    await expect(ensureAdminSession('')).rejects.toThrow()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('clears the Firebase admin session on sign out', async () => {
    const { endAdminSession } = await import('./adminClient')

    await endAdminSession()

    expect(signOutMock).toHaveBeenCalledWith(auth)
  })
})
