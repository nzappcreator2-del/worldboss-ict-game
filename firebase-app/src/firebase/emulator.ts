// Opt-in local emulator wiring, shared by the student client and the admin
// client so the two Firebase apps can never end up pointed at different
// backends.
//
// Two guards have to hold at once before anything is redirected:
//   1. `import.meta.env.DEV` — Vite statically replaces this with `false` in a
//      production build, so the whole branch (and the connect* imports it
//      guards) is dead-code-eliminated out of dist/. A shipped bundle cannot
//      talk to an emulator even if the env var were somehow present.
//   2. `VITE_FIREBASE_EMULATOR` — off unless the developer explicitly asks for
//      it, so a plain `npm run dev` still behaves exactly as it always has and
//      talks to the real project.
//
// Ports match the `emulators` block in ../../firebase.json.
export const FIRESTORE_EMULATOR_HOST = '127.0.0.1'
export const FIRESTORE_EMULATOR_PORT = 8080
export const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099'

export function emulatorEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATOR === '1'
}
