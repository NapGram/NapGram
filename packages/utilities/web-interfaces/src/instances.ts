import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authMiddleware } from '@napgram/auth-kit'
import { ApiResponse, count, db, desc, env, eq, InstanceRegistry, schema } from './shared-host.js'

/**
 * 实例管理 API
 */
export default async function (fastify: FastifyInstance) {
  const isNumeric = (val: any) => typeof val === 'string' && /^\d+$/.test(val)

  const toOptionalBigInt = z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined)
        return undefined
      if (typeof val === 'bigint')
        return val
      if (typeof val === 'number')
        return BigInt(val)
      if (isNumeric(val))
        return BigInt(val as string)
      return val // 让后续 z.bigint() 触发校验错误
    },
    z.bigint().optional(),
  )

  const toRequiredBigInt = z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined)
        return undefined
      if (typeof val === 'bigint')
        return val
      if (typeof val === 'number')
        return BigInt(val)
      if (isNumeric(val))
        return BigInt(val as string)
      return val
    },
    z.bigint(),
  )

  const optionalString = z.preprocess(
    val => (val === '' || val === null || val === undefined ? undefined : val),
    z.string().optional(),
  )

  const toOptionalIntOrNull = z.preprocess((val) => {
    if (val === '' || val === undefined)
      return undefined
    if (val === null)
      return null
    if (typeof val === 'number')
      return Number.isFinite(val) ? val : val
    if (isNumeric(val))
      return Number(val)
    return val
  }, z.number().int().nullable().optional())

  const qqBotSchema = z.object({
    type: z.literal('napcat').default('napcat'),
    name: optionalString,
    wsUrl: optionalString,
    uin: toOptionalBigInt,
  }).nullable()

  const createInstanceSchema = z.object({
    owner: toRequiredBigInt,
    workMode: z.string().default(''),
    userSessionId: toOptionalIntOrNull,
    qqBotId: z.number().optional(),
    qqBot: qqBotSchema.optional(),
  })

  const updateInstanceSchema = z.object({
    owner: toOptionalBigInt,
    workMode: z.string().optional(),
    userSessionId: toOptionalIntOrNull,
    isSetup: z.boolean().optional(),
    flags: z.number().optional(),
    qqBot: qqBotSchema.optional(),
  })

  const toJsonSafe = (value: any): any => {
    if (typeof value === 'bigint')
      return value.toString()
    if (Array.isArray(value))
      return value.map(toJsonSafe)
    if (value && typeof value === 'object') {
      if (value instanceof Date)
        return value
      const out: Record<string, any> = {}
      for (const [key, val] of Object.entries(value))
        out[key] = toJsonSafe(val)
      return out
    }
    return value
  }

  const createQqBotSchema = z.object({
    type: z.literal('napcat').default('napcat'),
    name: optionalString,
    wsUrl: optionalString,
    uin: toOptionalBigInt,
  })

  const getRuntimeInstance = (instanceId: number) => {
    try {
      return InstanceRegistry.getById(instanceId) as any
    }
    catch {
      return undefined
    }
  }

  const syncRuntimeInstance = async (instanceId: number, body: z.infer<typeof updateInstanceSchema>) => {
    const runtimeInstance = getRuntimeInstance(instanceId)
    if (!runtimeInstance)
      return

    if (body.owner !== undefined && 'owner' in runtimeInstance)
      runtimeInstance.owner = Number(body.owner)
    if (body.flags !== undefined && 'flags' in runtimeInstance)
      runtimeInstance.flags = body.flags
    if (body.isSetup !== undefined && 'isSetup' in runtimeInstance)
      runtimeInstance.isSetup = body.isSetup

    const nextWorkMode = body.workMode ?? runtimeInstance.workMode
    if (body.userSessionId !== undefined && 'userSessionId' in runtimeInstance)
      runtimeInstance.userSessionId = body.userSessionId

    if (body.workMode !== undefined) {
      if (typeof runtimeInstance.setWorkMode === 'function') {
        await runtimeInstance.setWorkMode(body.workMode)
      }
      else {
        runtimeInstance.workMode = body.workMode
      }
      return
    }

    if (body.userSessionId !== undefined && nextWorkMode === 'personal') {
      if (body.userSessionId && typeof runtimeInstance.startUserBot === 'function')
        await runtimeInstance.startUserBot()
      else if (!body.userSessionId && typeof runtimeInstance.stopUserBot === 'function')
        await runtimeInstance.stopUserBot()
    }
  }

  const buildPersonalModeDiagnostics = (instance: any, runtimeInstance?: any) => {
    if (typeof runtimeInstance?.getPersonalModeDiagnostics === 'function') {
      return runtimeInstance.getPersonalModeDiagnostics()
    }

    const workMode = runtimeInstance?.workMode ?? instance.workMode
    const userSessionId = runtimeInstance?.userSessionId ?? instance.userSessionId ?? null
    const userBotRequired = workMode === 'personal'
    const userBotStatus = userBotRequired
      ? (userSessionId ? (runtimeInstance?.userBotStatus ?? 'stopped') : 'not-configured')
      : 'disabled'

    return {
      workMode,
      userBotRequired,
      userSessionId,
      userBotStatus,
      hasTgUserBot: Boolean(runtimeInstance?.tgUserBot?.isOnline),
      canAutoProvisionPairs: userBotStatus === 'running',
      manualPairingAvailable: Boolean(runtimeInstance?.tgBot && runtimeInstance?.qqClient),
      ...(userBotRequired && !userSessionId
        ? { reason: 'personal 模式未配置 TG User session，自动建群不可用；手动绑定仍可使用' }
        : {}),
      ...(runtimeInstance?.userBotError ? { error: runtimeInstance.userBotError } : {}),
    }
  }

  const decorateInstance = (instance: any, extra: Record<string, any> = {}) => {
    const runtimeInstance = getRuntimeInstance(instance.id)
    const personalMode = buildPersonalModeDiagnostics(instance, runtimeInstance)
    return {
      ...toJsonSafe(instance),
      ...extra,
      runtimeStatus: runtimeInstance?.status ?? 'stopped',
      hasQqClient: Boolean(runtimeInstance?.qqClient),
      hasTgBot: Boolean(runtimeInstance?.tgBot),
      hasTgUserBot: Boolean(runtimeInstance?.tgUserBot?.isOnline),
      userBotStatus: personalMode.userBotStatus,
      personalMode,
    }
  }

  /**
   * GET /api/admin/instances
   * 获取所有实例
   */
  fastify.get('/api/admin/instances', {
    preHandler: authMiddleware,
  }, async (request) => {
    const { page = 1, pageSize = 20 } = request.query as any

    const [items, totalResult] = await Promise.all([
      db.query.instance.findMany({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        with: {
          qqBot: true,
          forwardPairs: {
            limit: 5,
          },
        },
        orderBy: [desc(schema.instance.id)],
      }),
      db.select({ value: count() }).from(schema.instance),
    ])
    const total = totalResult[0].value

    return ApiResponse.paginated(
      items.map((item: any) => {
        // Fallback to env vars for Instance 0
        const isDefaultInstance = item.id === 0
        const owner = (item.owner === BigInt(0) && isDefaultInstance && env.ADMIN_TG) ? env.ADMIN_TG.toString() : item.owner.toString()

        let qqBot = item.qqBot
          ? {
            ...item.qqBot,
            uin: item.qqBot.uin?.toString() || null,
          }
          : null

        if (!qqBot && isDefaultInstance && env.NAPCAT_WS_URL) {
          qqBot = {
            type: 'napcat',
            name: 'System Bootstrapped',
            wsUrl: env.NAPCAT_WS_URL,
            uin: env.ADMIN_QQ?.toString() || null,
            id: -1, // Virtual ID
            password: null,
            platform: null,
            signApi: null,
            signVer: null,
            signDockerId: null,
          }
        }

        return decorateInstance(item, {
          owner,
          qqBot,
          ForwardPair: item.forwardPairs.map((pair: any) => ({
            ...pair,
            qqRoomId: pair.qqRoomId.toString(),
            tgChatId: pair.tgChatId.toString(),
            qqFromGroupId: pair.qqFromGroupId?.toString() || null,
          })),
          pairCount: item.forwardPairs.length,
        })
      }),
      total,
      page,
      pageSize,
    )
  })

  /**
   * GET /api/admin/instances/:id
   * 获取单个实例详情
   */
  fastify.get('/api/admin/instances/:id', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const instanceId = Number.parseInt(id)

    const instance = await db.query.instance.findFirst({
      where: eq(schema.instance.id, instanceId),
      with: {
        qqBot: true,
        forwardPairs: true,
      },
    })

    if (!instance) {
      return reply.code(404).send(
        ApiResponse.error('Instance not found'),
      )
    }

    // Fallback logic
    const isDefaultInstance = instance.id === 0
    const owner = (instance.owner === BigInt(0) && isDefaultInstance && env.ADMIN_TG) ? env.ADMIN_TG.toString() : instance.owner.toString()

    let qqBot = instance.qqBot
      ? {
        ...instance.qqBot,
        uin: instance.qqBot.uin?.toString() || null,
      }
      : null

    if (!qqBot && isDefaultInstance && env.NAPCAT_WS_URL) {
      qqBot = {
        type: 'napcat',
        name: 'System Bootstrapped',
        wsUrl: env.NAPCAT_WS_URL,
        uin: env.ADMIN_QQ?.toString() || null,
        id: -1,
        password: null,
        platform: null,
        signApi: null,
        signVer: null,
        signDockerId: null,
      }
    }

    return {
      success: true,
      data: {
        ...decorateInstance(instance, { owner, qqBot }),
      },
    }
  })

  /**
   * POST /api/admin/instances
   * 创建新实例
   */
  fastify.post('/api/admin/instances', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    try {
      const body = createInstanceSchema.parse(request.body)
      const auth = (request as any).auth

      let qqBotId = body.qqBotId || null
      if (body.qqBot) {
        const botArr = await db.insert(schema.qqBot).values({
          type: body.qqBot.type,
          name: body.qqBot.name || null,
          wsUrl: body.qqBot.wsUrl || null,
          uin: body.qqBot.uin ?? null,
        }).returning()
        qqBotId = botArr[0].id
      }

      const instanceArr = await db.insert(schema.instance).values({
        owner: body.owner,
        workMode: body.workMode,
        ...(body.userSessionId !== undefined ? { userSessionId: body.userSessionId } : {}),
        isSetup: false,
        qqBotId,
      }).returning()
      const instance = instanceArr[0]

      // 审计日志
      const { AuthService } = await import('@napgram/auth-kit')
      await AuthService.logAudit(
        auth.userId,
        'create_instance',
        'instance',
        instance.id.toString(),
        {
          owner: instance.owner.toString(),
          workMode: instance.workMode,
        },
        request.ip,
        request.headers['user-agent'],
      )

      return {
        success: true,
        data: {
          ...instance,
          owner: instance.owner.toString(),
        },
      }
    }
    catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          ...ApiResponse.error('Invalid request'),
          details: error.issues,
        })
      }
      throw error
    }
  })

  /**
   * PUT /api/admin/instances/:id
   * 更新实例
   */
  fastify.put('/api/admin/instances/:id', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const body = updateInstanceSchema.parse(request.body)
      const auth = (request as any).auth

      const instanceId = Number.parseInt(id)
      const currentInstance = await db.query.instance.findFirst({
        where: eq(schema.instance.id, instanceId),
        columns: { id: true, qqBotId: true },
      })
      if (!currentInstance) {
        return reply.code(404).send(
          ApiResponse.error('Instance not found'),
        )
      }

      let qqBotId: number | null | undefined
      if (body.qqBot !== undefined) {
        if (body.qqBot === null) {
          qqBotId = null
        }
        else if (currentInstance.qqBotId) {
          await db.update(schema.qqBot)
            .set({
              type: body.qqBot.type,
              name: body.qqBot.name || null,
              wsUrl: body.qqBot.wsUrl || null,
              uin: body.qqBot.uin ?? null,
            })
            .where(eq(schema.qqBot.id, currentInstance.qqBotId))
          qqBotId = currentInstance.qqBotId
        }
        else {
          const botArr = await db.insert(schema.qqBot).values({
            type: body.qqBot.type,
            name: body.qqBot.name || null,
            wsUrl: body.qqBot.wsUrl || null,
            uin: body.qqBot.uin ?? null,
          }).returning()
          qqBotId = botArr[0].id
        }
      }

      const updatedArr = await db.update(schema.instance)
        .set({
          ...(body.owner !== undefined && { owner: body.owner }),
          ...(body.workMode !== undefined && { workMode: body.workMode }),
          ...(body.userSessionId !== undefined && { userSessionId: body.userSessionId }),
          ...(body.isSetup !== undefined && { isSetup: body.isSetup }),
          ...(body.flags !== undefined && { flags: body.flags }),
          ...(qqBotId !== undefined && { qqBotId }),
        })
        .where(eq(schema.instance.id, instanceId))
        .returning()
      const instance = updatedArr[0]

      await syncRuntimeInstance(instanceId, body)

      // 审计日志
      const { AuthService } = await import('@napgram/auth-kit')
      await AuthService.logAudit(
        auth.userId,
        'update_instance',
        'instance',
        instance.id.toString(),
        body,
        request.ip,
        request.headers['user-agent'],
      )

      return {
        success: true,
        data: {
          ...decorateInstance(instance),
          owner: instance.owner.toString(),
        },
      }
    }
    catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          ...ApiResponse.error('Invalid request'),
          details: error.issues,
        })
      }
      return reply.code(404).send(
        ApiResponse.error('Instance update failed'),
      )
      throw error
    }
  })

  /**
   * DELETE /api/admin/instances/:id
   * 删除实例
   */
  fastify.delete('/api/admin/instances/:id', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const auth = (request as any).auth

    try {
      const instanceArr = await db.delete(schema.instance)
        .where(eq(schema.instance.id, Number.parseInt(id)))
        .returning()
      const instance = instanceArr[0]

      // 审计日志
      const { AuthService } = await import('@napgram/auth-kit')
      await AuthService.logAudit(
        auth.userId,
        'delete_instance',
        'instance',
        instance.id.toString(),
        {
          owner: instance.owner.toString(),
          workMode: instance.workMode,
        },
        request.ip,
        request.headers['user-agent'],
      )

      return ApiResponse.success(undefined, 'Instance deleted successfully')
    }
    catch (error: any) {
      if (error.code === 'P2025') {
        return reply.code(404).send(
          ApiResponse.error('Instance not found'),
        )
      }
      throw error
    }
  })

  /**
   * GET /api/admin/qqbots
   * 获取所有 QQ Bot 配置
   */
  fastify.get('/api/admin/qqbots', {
    preHandler: authMiddleware,
  }, async () => {
    const bots = await db.query.qqBot.findMany({
      with: {
        instances: {
          columns: {
            id: true,
            owner: true,
          },
        },
      },
    })

    return {
      success: true,
      data: bots.map((bot: any) => ({
        ...bot,
        uin: bot.uin?.toString() || null,
        password: bot.password ? '******' : null, // 隐藏密码
      })),
    }
  })

  /**
   * POST /api/admin/qqbots
   * 创建 QQ Bot 配置
   */
  fastify.post('/api/admin/qqbots', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    try {
      const body = createQqBotSchema.parse(request.body)

      const botArr = await db.insert(schema.qqBot).values({
        type: body.type,
        name: body.name || null,
        wsUrl: body.wsUrl || null,
        uin: body.uin ?? null,
      }).returning()

      const bot = botArr[0]

      return {
        success: true,
        data: {
          ...bot,
          uin: bot.uin?.toString() || null,
          password: bot.password ? '******' : null,
        },
      }
    }
    catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          ...ApiResponse.error('Invalid request'),
          details: error.issues,
        })
      }
      throw error
    }
  })

  // ==========================================
  // UserBot 认证及控制接口 (Phase 3)
  // ==========================================

  interface PendingLogin {
    phone: string
    status: 'waiting-code' | 'waiting-password' | 'done' | 'error'
    error?: string
    resolveCode?: (code: string) => void
    resolvePassword?: (password: string) => void
  }

  const pendingLogins = new Map<number, PendingLogin>()

  /**
   * POST /api/admin/instances/:id/userbot/login
   * 发起 TG UserBot 登录流程，提交手机号
   */
  fastify.post('/api/admin/instances/:id/userbot/login', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const instanceId = Number((request.params as any).id)
    const body = z.object({
      phone: z.string(),
    }).parse(request.body)

    const instances = await db.select().from(schema.instance).where(eq(schema.instance.id, instanceId)).limit(1)
    const instance = instances[0]
    if (!instance) {
      return reply.code(404).send(ApiResponse.error('Instance not found'))
    }

    if (instance.workMode !== 'personal') {
      return reply.code(400).send(ApiResponse.error('Instance is not in personal mode'))
    }

    let userSessionId = instance.userSessionId
    if (!userSessionId) {
      const sessionArr = await db.insert(schema.session).values({
        dcId: Number(env.TG_INITIAL_DCID ?? 2),
        serverAddress: env.TG_INITIAL_SERVER ?? '149.154.167.50',
      }).returning()
      userSessionId = sessionArr[0].id
      await db.update(schema.instance).set({ userSessionId }).where(eq(schema.instance.id, instanceId))
    }

    const existing = pendingLogins.get(instanceId)
    if (existing) {
      if (existing.resolveCode) existing.resolveCode('')
      if (existing.resolvePassword) existing.resolvePassword('')
      pendingLogins.delete(instanceId)
    }

    const state: PendingLogin = {
      phone: body.phone,
      status: 'waiting-code',
    }
    pendingLogins.set(instanceId, state)

    const runLogin = async () => {
      try {
        const { telegramClientFactory } = await import('@napgram/telegram-client')
        const bot = await telegramClientFactory.connect({
          type: 'mtcute',
          sessionId: userSessionId!,
          authMode: 'user',
          appName: 'NapGram User',
          phone: () => state.phone,
          code: () => new Promise<string>((resolve, reject) => {
            state.resolveCode = resolve
            setTimeout(() => reject(new Error('Login timed out waiting for verification code')), 300_000)
          }),
          password: () => new Promise<string>((resolve, reject) => {
            state.status = 'waiting-password'
            state.resolvePassword = resolve
            setTimeout(() => reject(new Error('Login timed out waiting for 2FA password')), 300_000)
          }),
        })

        state.status = 'done'
        pendingLogins.delete(instanceId)

        const runtimeInstance = InstanceRegistry.getById(instanceId) as any
        if (runtimeInstance) {
          if (typeof runtimeInstance.startUserBot === 'function') {
            await runtimeInstance.startUserBot()
          } else {
            if (runtimeInstance.tgUserBot) {
              try { await (runtimeInstance.tgUserBot as any).disconnect?.() } catch {}
            }
            runtimeInstance.tgUserBot = bot
            runtimeInstance._userBotStatus = 'running'
          }
        }
      }
      catch (error: any) {
        state.status = 'error'
        state.error = error?.message || String(error)
        const runtimeInstance = InstanceRegistry.getById(instanceId) as any
        if (runtimeInstance) {
          runtimeInstance._userBotStatus = 'error'
          runtimeInstance._userBotError = state.error
        }
      }
    }

    void runLogin()

    return {
      success: true,
      status: 'waiting-code',
    }
  })

  /**
   * POST /api/admin/instances/:id/userbot/login/code
   * 提交登录验证码
   */
  fastify.post('/api/admin/instances/:id/userbot/login/code', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const instanceId = Number((request.params as any).id)
    const body = z.object({
      code: z.string(),
    }).parse(request.body)

    const state = pendingLogins.get(instanceId)
    if (!state || state.status !== 'waiting-code' || !state.resolveCode) {
      return reply.code(400).send(ApiResponse.error('No pending login waiting for verification code'))
    }

    state.resolveCode(body.code)

    await new Promise(resolve => setTimeout(resolve, 2500))

    const current = pendingLogins.get(instanceId)
    return {
      success: true,
      status: current ? current.status : 'done',
      error: current?.error || null,
    }
  })

  /**
   * POST /api/admin/instances/:id/userbot/login/password
   * 提交 2FA 密码
   */
  fastify.post('/api/admin/instances/:id/userbot/login/password', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const instanceId = Number((request.params as any).id)
    const body = z.object({
      password: z.string(),
    }).parse(request.body)

    const state = pendingLogins.get(instanceId)
    if (!state || state.status !== 'waiting-password' || !state.resolvePassword) {
      return reply.code(400).send(ApiResponse.error('No pending login waiting for 2FA password'))
    }

    state.resolvePassword(body.password)

    await new Promise(resolve => setTimeout(resolve, 2500))

    const current = pendingLogins.get(instanceId)
    return {
      success: true,
      status: current ? current.status : 'done',
      error: current?.error || null,
    }
  })

  /**
   * GET /api/admin/instances/:id/userbot/login/status
   * 查询登录状态
   */
  fastify.get('/api/admin/instances/:id/userbot/login/status', {
    preHandler: authMiddleware,
  }, async (request) => {
    const instanceId = Number((request.params as any).id)
    const state = pendingLogins.get(instanceId)

    if (!state) {
      return {
        success: true,
        status: 'idle',
      }
    }

    return {
      success: true,
      status: state.status,
      error: state.error || null,
    }
  })

  /**
   * POST /api/admin/instances/:id/userbot/stop
   * 断开 TG UserBot
   */
  fastify.post('/api/admin/instances/:id/userbot/stop', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const instanceId = Number((request.params as any).id)

    const runtimeInstance = InstanceRegistry.getById(instanceId) as any
    if (!runtimeInstance) {
      return reply.code(404).send(ApiResponse.error('Runtime instance not found or not running'))
    }

    if (typeof runtimeInstance.stopUserBot === 'function') {
      await runtimeInstance.stopUserBot()
    } else {
      if (runtimeInstance.tgUserBot) {
        try { await (runtimeInstance.tgUserBot as any).disconnect?.() } catch {}
        runtimeInstance.tgUserBot = undefined
      }
      runtimeInstance._userBotStatus = 'stopped'
    }

    return {
      success: true,
      status: 'stopped',
    }
  })

  /**
   * POST /api/admin/instances/:id/userbot/start
   * 启动已配置的 TG UserBot
   */
  fastify.post('/api/admin/instances/:id/userbot/start', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const instanceId = Number((request.params as any).id)

    const runtimeInstance = InstanceRegistry.getById(instanceId) as any
    if (!runtimeInstance) {
      return reply.code(404).send(ApiResponse.error('Runtime instance not found or not running'))
    }

    if (typeof runtimeInstance.startUserBot === 'function') {
      await runtimeInstance.startUserBot()
    } else {
      const { telegramClientFactory } = await import('@napgram/telegram-client')
      if (runtimeInstance.userSessionId) {
        runtimeInstance._userBotStatus = 'starting'
        try {
          const bot = await telegramClientFactory.connect({
            type: 'mtcute',
            sessionId: runtimeInstance.userSessionId,
            authMode: 'user',
            appName: 'NapGram User',
          })
          runtimeInstance.tgUserBot = bot
          runtimeInstance._userBotStatus = 'running'
        } catch (error: any) {
          runtimeInstance._userBotStatus = 'error'
          runtimeInstance._userBotError = error?.message || String(error)
          return reply.code(500).send(ApiResponse.error(`Failed to start UserBot: ${runtimeInstance._userBotError}`))
        }
      } else {
        return reply.code(400).send(ApiResponse.error('UserBot session is not configured'))
      }
    }

    return {
      success: true,
      status: 'running',
    }
  })
}
