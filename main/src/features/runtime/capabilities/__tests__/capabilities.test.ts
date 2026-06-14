import { describe, expect, it } from 'vitest'

import * as db from '../db.js'
import * as env from '../env.js'
import * as events from '../events.js'
import * as hashing from '../hashing.js'
import * as logging from '../logging.js'
import * as media from '../media.js'
import * as observability from '../observability.js'
import * as temp from '../temp.js'

describe('capabilities Exports', () => {
  it('exports db correctly', () => {
    expect(db).toBeDefined()
    expect(Object.keys(db).length).toBeGreaterThan(0)
  })

  it('exports env correctly', () => {
    expect(env).toBeDefined()
    expect(Object.keys(env).length).toBeGreaterThan(0)
  })

  it('exports events correctly', () => {
    expect(events).toBeDefined()
    expect(Object.keys(events).length).toBeGreaterThan(0)
  })

  it('exports hashing correctly', () => {
    expect(hashing).toBeDefined()
    expect(Object.keys(hashing).length).toBeGreaterThan(0)
  })

  it('exports logging correctly', () => {
    expect(logging).toBeDefined()
    expect(Object.keys(logging).length).toBeGreaterThan(0)
  })

  it('exports media correctly', () => {
    expect(media).toBeDefined()
    expect(Object.keys(media).length).toBeGreaterThan(0)
  })

  it('exports observability correctly', () => {
    expect(observability).toBeDefined()
    expect(Object.keys(observability).length).toBeGreaterThan(0)
  })

  it('exports temp correctly', () => {
    expect(temp).toBeDefined()
    expect(Object.keys(temp).length).toBeGreaterThan(0)
  })
})
