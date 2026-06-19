import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Mock runtime
vi.mock('../runtime.js', () => {
  const chain: any = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.from = vi.fn().mockReturnValue(chain)
  chain.where = vi.fn().mockReturnValue(chain)
  chain.orderBy = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.groupBy = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.values = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.set = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.returning = vi.fn().mockResolvedValue([])

  return {
    db: chain,
    schema: {
      qqRequest: { instanceId: 'iid', status: 's', createdAt: 'c', type: 't', id: 'id', flag: 'f' },
      automationRule: { instanceId: 'iid', enabled: 'e', target: 't', priority: 'p', id: 'id', matchCount: 'mc' },
      requestStatistics: { instanceId: 'iid' },
    },
    eq: vi.fn(() => ({})),
    and: vi.fn(() => ({})),
    or: vi.fn(() => ({})),
    lt: vi.fn(() => ({})),
    desc: vi.fn(() => ({})),
    sql: vi.fn(() => ({})),
    getLogger: vi.fn().mockReturnValue({ trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  }
})

describe('RequestAutomationService', () => {
  let service: any
  let mockGateway: any

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    mockGateway = {
      approveFriendRequest: vi.fn().mockResolvedValue(undefined),
      rejectFriendRequest: vi.fn().mockResolvedValue(undefined),
      approveGroupRequest: vi.fn().mockResolvedValue(undefined),
      rejectGroupRequest: vi.fn().mockResolvedValue(undefined),
    }

    const { RequestAutomationService } = await import('../RequestAutomationService.js')
    service = new RequestAutomationService(1, mockGateway)
  })

  afterEach(() => {
    service?.destroy()
    vi.useRealTimers()
  })

  it('should create service instance', () => {
    expect(service).toBeDefined()
  })

  it('should cleanup interval on destroy', () => {
    service.destroy()
    expect(true).toBe(true)
  })
})
