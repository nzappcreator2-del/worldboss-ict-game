import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { firebaseConfig } from './config'

export const firebaseApp = initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
export const db = getFirestore(firebaseApp)

let authTask: ReturnType<typeof signInAnonymously> | undefined

export async function ensureSignedIn() {
  if (auth.currentUser) return auth.currentUser
  authTask ??= signInAnonymously(auth)
  const credential = await authTask
  return credential.user
}
