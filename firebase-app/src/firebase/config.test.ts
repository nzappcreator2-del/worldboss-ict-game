import { describe, expect, it } from 'vitest'
import { firebaseConfig } from './config'

describe('firebaseConfig', () => {
  it('targets the requested Firebase project', () => {
    expect(firebaseConfig.projectId).toBe('nextgen-play-19dd2')
    expect(firebaseConfig.authDomain).toBe('nextgen-play-19dd2.firebaseapp.com')
  })

  it('contains only public Firebase web configuration', () => {
    expect(firebaseConfig).not.toHaveProperty('privateKey')
    expect(firebaseConfig).not.toHaveProperty('clientEmail')
  })
})
