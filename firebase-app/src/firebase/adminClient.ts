import { getApp, getApps, initializeApp } from 'firebase/app'
import { browserSessionPersistence, getAuth, setPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { firebaseConfig } from './config'

export const ADMIN_EMAIL = 'admin@nextgen-play.local'

const adminApp = getApps().some((app) => app.name === 'nextgen-admin')
  ? getApp('nextgen-admin')
  : initializeApp(firebaseConfig, 'nextgen-admin')

export const adminAuth = getAuth(adminApp)
export const adminDb = getFirestore(adminApp)

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
