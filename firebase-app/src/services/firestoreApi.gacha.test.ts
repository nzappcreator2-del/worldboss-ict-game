// Service-level wiring for the item gacha: what the client actually writes to
// Firestore. The pure draw is covered in gachaLogic.test.ts; this pins the
// transaction contract — coins deducted exactly once, the prize banked in the
// cosmetics bag, and no write at all on a refused roll.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./adminApi', () => ({ adminApi: {} }))
vi.mock('./aiApi', () => ({ aiApi: {} }))
vi.mock('./pvpApi', () => ({ pvpApi: {} }))

vi.mock('../firebase/client', () => ({
  db: {},
  ensureSignedIn: vi.fn(async () => ({ uid: 'OWNER' })),
}))

const state: { coins: number; inventory: Record<string, unknown> } = { coins: 900, inventory: {} }
const userUpdates: Array<Record<string, unknown>> = []

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ __path: path }),
  doc: (_db: unknown, ...rest: string[]) => ({ __path: rest.join('/') }),
  query: (base: unknown) => base,
  where: (...args: unknown[]) => ({ __where: args }),
  orderBy: (...args: unknown[]) => ({ __orderBy: args }),
  limit: (n: number) => ({ __limit: n }),
  getDocs: vi.fn(async () => ({ docs: [] })),
  getDoc: vi.fn(async () => ({ exists: () => true, data: () => ({ ownerUid: 'OWNER' }) })),
  getCountFromServer: vi.fn(async () => ({ data: () => ({ count: 0 }) })),
  runTransaction: vi.fn(async (_db: unknown, run: (transaction: unknown) => Promise<unknown>) => run({
    get: async () => ({
      exists: () => true,
      data: () => ({ ownerUid: 'OWNER', name: 'ฟ้าใส', class: 'ป.4/1', xp: 0, coins: state.coins, inventory: state.inventory }),
    }),
    set: vi.fn(),
    update: (ref: { __path: string }, values: Record<string, unknown>) => {
      if (ref.__path.startsWith('users')) userUpdates.push(values)
    },
  })),
  serverTimestamp: () => 'ts',
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  onSnapshot: vi.fn(),
}))

import { firestoreApi } from './firestoreApi'
import { COSMETIC_CATALOG } from './gameLogic'
import { GACHA_ROLL_COST } from './gachaLogic'

type GachaResponse = {
  success: boolean
  error?: string
  coins?: number
  itemId?: string
  name?: string
  rarity?: string
  price?: number
  inventory?: Record<string, unknown>
}

const paidIds = Object.values(COSMETIC_CATALOG).filter((item) => item.price > 0).map((item) => item.id)

beforeEach(() => {
  userUpdates.length = 0
  state.coins = 900
  state.inventory = {}
})

describe('gachaRoll', () => {
  it('is exposed on the Firebase service surface', () => {
    expect(firestoreApi.gachaRoll).toBeTypeOf('function')
  })

  it('deducts exactly the roll cost and banks a real catalog item', async () => {
    const result = await firestoreApi.gachaRoll('u1') as GachaResponse

    expect(result.success).toBe(true)
    expect(result.coins).toBe(900 - GACHA_ROLL_COST)
    expect(COSMETIC_CATALOG[result.itemId!]).toBeDefined()
    expect(result.name).toBe(COSMETIC_CATALOG[result.itemId!].name)
    expect(['COMMON', 'UNCOMMON', 'RARE', 'LEGENDARY']).toContain(result.rarity)

    expect(userUpdates).toHaveLength(1)
    const written = userUpdates[0] as { coins: number; inventory: { cosmetics: { owned: string[]; equipped: Record<string, string> } } }
    expect(written.coins).toBe(900 - GACHA_ROLL_COST)
    expect(written.inventory.cosmetics.owned).toContain(result.itemId)
    expect(written.inventory.cosmetics.equipped[COSMETIC_CATALOG[result.itemId!].slot]).toBe(result.itemId)
  })

  it('writes nothing when the player cannot afford the roll', async () => {
    state.coins = GACHA_ROLL_COST - 1

    const result = await firestoreApi.gachaRoll('u1') as GachaResponse

    expect(result.success).toBe(false)
    expect(result.error).toContain('เหรียญไม่พอ')
    expect(userUpdates).toHaveLength(0)
  })

  it('writes nothing once the whole wardrobe is owned', async () => {
    state.inventory = { cosmetics: { owned: paidIds, equipped: {} } }

    const result = await firestoreApi.gachaRoll('u1') as GachaResponse

    expect(result.success).toBe(false)
    expect(result.error).toContain('ครบทุกชิ้น')
    expect(userUpdates).toHaveLength(0)
  })

  it('never touches the avatar — that is the legacy emoji gacha, not this one', async () => {
    await firestoreApi.gachaRoll('u1')

    expect(Object.keys(userUpdates[0])).toEqual(expect.arrayContaining(['coins', 'inventory']))
    expect(userUpdates[0]).not.toHaveProperty('avatar')
  })

  it('leaves the legacy emoji gacha in place for the legacy bridge', () => {
    expect(firestoreApi.gachaAvatar).toBeTypeOf('function')
  })
})
