import { initializeApp } from 'firebase/app'
import { browserLocalPersistence, indexedDBLocalPersistence, initializeAuth, signInAnonymously } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { firebaseConfig } from './config'

export const firebaseApp = initializeApp(firebaseConfig)
// initializeAuth (not getAuth) with no popupRedirectResolver: the main app only
// uses anonymous auth, so we skip the eager apis.google.com/js/api.js OAuth
// iframe that the Hosting CSP intentionally blocks from script-src. Persistence
// mirrors getAuth's default (IndexedDB, falling back to localStorage) so the
// anonymous session and its claimed student profile survive reloads.
export const auth = initializeAuth(firebaseApp, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
})
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
