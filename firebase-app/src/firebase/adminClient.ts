import { getApp, getApps, initializeApp } from 'firebase/app'
import { browserSessionPersistence, connectAuthEmulator, getAuth, initializeAuth, setPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { firebaseConfig } from './config'
import { AUTH_EMULATOR_URL, FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT, emulatorEnabled } from './emulator'

export const ADMIN_EMAIL = 'admin@nextgen-play.local'

const adminAppExists = getApps().some((app) => app.name === 'nextgen-admin')
const adminApp = adminAppExists ? getApp('nextgen-admin') : initializeApp(firebaseConfig, 'nextgen-admin')

// initializeAuth (not getAuth) with no popupRedirectResolver: the admin panel
// only uses email/password auth, so we skip the eager apis.google.com/js/api.js
// OAuth iframe that the Hosting CSP intentionally blocks from script-src.
// Session-only persistence keeps the admin login from surviving a tab close. On
// HMR the app is already auth-initialized, so fall back to getAuth since
// initializeAuth may run only once per Firebase app.
export const adminAuth = adminAppExists
  ? getAuth(adminApp)
  : initializeAuth(adminApp, { persistence: browserSessionPersistence })
export const adminDb = getFirestore(adminApp)

// Dev-only: see ./emulator.ts. The admin app is a second Firebase app, so it
// needs its own redirect — but only on a first init, since connect* throws once
// the instance has already issued a request (HMR re-entry).
if (emulatorEnabled() && !adminAppExists) {
  connectAuthEmulator(adminAuth, AUTH_EMULATOR_URL, { disableWarnings: true })
  connectFirestoreEmulator(adminDb, FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT)
}

let persistenceTask: Promise<void> | undefined

export async function ensureAdminSession(password: unknown) {
  // Reuse the live session: signing in once per admin action hammers the
  // Firebase Auth endpoint and risks a mid-class rate-limit lockout.
  const current = adminAuth.currentUser
  if (current && current.email === ADMIN_EMAIL) return current
  const cleanPassword = String(password || '')
  if (!cleanPassword) throw new Error('กรุณาระบุรหัสผ่านผู้ดูแลระบบ')
  persistenceTask ??= setPersistence(adminAuth, browserSessionPersistence)
  await persistenceTask
  const credential = await signInWithEmailAndPassword(adminAuth, ADMIN_EMAIL, cleanPassword)
  if (credential.user.email !== ADMIN_EMAIL) throw new Error('บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ')
  return credential.user
}

export async function endAdminSession() {
  await signOut(adminAuth)
}
