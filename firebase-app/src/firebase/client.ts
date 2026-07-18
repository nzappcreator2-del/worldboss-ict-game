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
  if (!authTask) {
    // Clear the cached task on failure so a flaky network doesn't poison
    // every later call with the same rejected promise.
    authTask = signInAnonymously(auth)
    authTask.catch(() => {
      authTask = undefined
    })
  }
  const credential = await authTask
  return credential.user
}
