export type FirebaseService = (...args: unknown[]) => unknown | Promise<unknown>
export type FirebaseServices = Record<string, FirebaseService>

type Handler = (value: unknown) => void
type RunnerState = { success?: Handler; failure?: Handler }

export type LegacyRunner = {
  withSuccessHandler(handler: Handler): LegacyRunner
  withFailureHandler(handler: Handler): LegacyRunner
} & Record<string, (...args: unknown[]) => unknown>

export function createLegacyRunner(services: FirebaseServices): LegacyRunner {
  let pending: RunnerState = {}

  const consume = () => {
    const current = pending
    pending = {}
    return current
  }

  const proxy = new Proxy({} as LegacyRunner, {
    get(_target, property) {
      if (property === 'withSuccessHandler') {
        return (handler: Handler) => {
          pending.success = handler
          return proxy
        }
      }
      if (property === 'withFailureHandler') {
        return (handler: Handler) => {
          pending.failure = handler
          return proxy
        }
      }
      if (typeof property !== 'string') return undefined

      return (...args: unknown[]) => {
        const handlers = consume()
        const service = services[property]
        const task = service
          ? Promise.resolve().then(() => service(...args))
          : Promise.reject(new Error(`Firebase service "${property}" has not been migrated from GAS`))

        void task.then(
          (result) => handlers.success?.(result),
          (error: unknown) => {
            const normalized = error instanceof Error ? error : new Error(String(error))
            if (handlers.failure) handlers.failure(normalized)
            else console.error(normalized)
          },
        )
      }
    },
  })

  return proxy
}

export function installFirebaseServiceRunner(services: FirebaseServices): void {
  const root = window as typeof window & { firebaseServices?: LegacyRunner }
  root.firebaseServices = createLegacyRunner(services)
}
