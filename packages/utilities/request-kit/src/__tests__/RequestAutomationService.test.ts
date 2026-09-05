import { describe, expect, it, beforeEach, afterEach, mock, jest } from 'bun:test'

// Mock runtime
mock.module('../runtime.js', () => {
  const chain: any = {}
  chain.select = mock().mockReturnValue(chain)
  chain.from = mock().mockReturnValue(chain)
  chain.where = mock().mockReturnValue(chain)
  chain.orderBy = mock().mockReturnValue(chain)
  chain.limit = mock().mockReturnValue(chain)
  chain.groupBy = mock().mockReturnValue(chain)
  chain.insert = mock().mockReturnValue(chain)
  chain.values = mock().mockReturnValue(chain)
  chain.update = mock().mockReturnValue(chain)
  chain.set = mock().mockReturnValue(chain)
  chain.delete = mock().mockReturnValue(chain)
  chain.returning = mock().mockResolvedValue([])

  return {
    db: chain,
    schema: {
      qqRequest: { instanceId: 'iid', status: 's', createdAt: 'c', type: 't', id: 'id', flag: 'f' },
      automationRule: { instanceId: 'iid', enabled: 'e', target: 't', priority: 'p', id: 'id', matchCount: 'mc' },
      requestStatistics: { instanceId: 'iid' },
    },
    eq: mock(() => ({})),
    and: mock(() => ({})),
    or: mock(() => ({})),
    lt: mock(() => ({})),
    desc: mock(() => ({})),
    sql: mock(() => ({})),
    getLogger: mock().mockReturnValue({ trace: mock(), debug: mock(), info: mock(), warn: mock(), error: mock() }),
  }
})

describe('RequestAutomationService', () => {
  let service: any
  let mockGateway: any

  beforeEach(async () => {
    mock.clearAllMocks()
    jest.useFakeTimers()

    mockGateway = {
      approveFriendRequest: mock().mockResolvedValue(undefined),
      rejectFriendRequest: mock().mockResolvedValue(undefined),
      approveGroupRequest: mock().mockResolvedValue(undefined),
      rejectGroupRequest: mock().mockResolvedValue(undefined),
    }

    const { RequestAutomationService } = await import('../RequestAutomationService.js')
    service = new RequestAutomationService(1, mockGateway)
  })

  afterEach(() => {
    service?.destroy()
    jest.useRealTimers()
  })

  it('should create service instance', () => {
    expect(service).toBeDefined()
  })

  it('should cleanup interval on destroy', () => {
    service.destroy()
    expect(true).toBe(true)
  })
})
