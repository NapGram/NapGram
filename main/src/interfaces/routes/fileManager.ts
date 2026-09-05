import type { FastifyInstance } from 'fastify'
import { concatBytes } from '../../shared/utils/binary.js'
import { basename, dirname, isAbsolute, joinPath, normalizePath, relativePath, resolvePath } from '../../shared/utils/path.js'
import { bunEnv } from '../../shared/utils/runtime.js'
import multipart from '@fastify/multipart'
import { requirePermission } from '@napgram/auth-kit'
import { getLogger } from '@napgram/logger-kit'
import { runtimeFileIO } from '@napgram/runtime-kit'

const logger = getLogger('FileAPI')

const DATA_ROOT = resolvePath('/', bunEnv.FILE_MANAGER_ROOT || '/app/data')

const FILE_SIZE_LIMITS = {
  read: 10 * 1024 * 1024,
  upload: 100 * 1024 * 1024,
  edit: 5 * 1024 * 1024,
}

function sanitizePath(userPath: string): { allowed: boolean, fullPath: string, error?: string } {
  try {
    const normalized = normalizePath(userPath)
    const fullPath = resolvePath(DATA_ROOT, normalized.startsWith('/') ? normalized.slice(1) : normalized)
    const relative = relativePath(DATA_ROOT, fullPath)

    if (relative === '..' || relative.startsWith('../') || isAbsolute(relative)) {
      return { allowed: false, fullPath: '', error: 'Access denied: path outside allowed root' }
    }

    return { allowed: true, fullPath }
  }
  catch (error) {
    return { allowed: false, fullPath: '', error: error instanceof Error ? error.message : 'Invalid path' }
  }
}

export function registerFileManagerRoutes(app: FastifyInstance) {
  /* c8 ignore start */
  app.register(multipart, {
    limits: {
      fileSize: FILE_SIZE_LIMITS.upload,
    },
  })

  app.get('/api/files/list', { preHandler: requirePermission('files:read') }, async (request, reply) => {
    const { path: reqPath } = request.query as { path?: string }

    if (!reqPath) {
      return reply.status(400).send({ success: false, error: 'Path is required' })
    }

    const { allowed, fullPath, error } = sanitizePath(reqPath)
    if (!allowed) {
      return reply.status(403).send({ success: false, error })
    }

    try {
      const entries = await runtimeFileIO.readdir(fullPath)
      const files = await Promise.all(
        entries.map(async (entryName) => {
          try {
            const entryPath = joinPath(fullPath, entryName)
            const stats = await runtimeFileIO.stat(entryPath)
            return {
              name: entryName,
              path: joinPath(reqPath, entryName),
              type: stats.isDirectory() ? 'directory' : 'file',
              size: stats.size,
              modified: stats.mtime.toISOString(),
              permissions: `0${(stats.mode & Number.parseInt('777', 8)).toString(8)}`,
            }
          }
          catch (err) {
            logger.warn(`Failed to stat ${entryName}:`, err)
            return null
          }
        }),
      )

      return reply.send({
        success: true,
        path: reqPath,
        files: files.filter((file): file is NonNullable<typeof file> => file !== null),
      })
    }
    catch (error) {
      logger.error('Failed to list files:', error)
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list files',
      })
    }
  })

  app.get('/api/files/read', { preHandler: requirePermission('files:read') }, async (request, reply) => {
    const { path: reqPath } = request.query as { path?: string }

    if (!reqPath) {
      return reply.status(400).send({ success: false, error: 'Path is required' })
    }

    const { allowed, fullPath, error } = sanitizePath(reqPath)
    if (!allowed) {
      return reply.status(403).send({ success: false, error })
    }

    try {
      const stats = await runtimeFileIO.stat(fullPath)

      if (stats.isDirectory()) {
        return reply.status(400).send({ success: false, error: 'Cannot read directory' })
      }

      if (stats.size > FILE_SIZE_LIMITS.read) {
        return reply.status(413).send({
          success: false,
          error: `File too large (max ${FILE_SIZE_LIMITS.read / 1024 / 1024}MB)`,
        })
      }

      const content = await runtimeFileIO.readText(fullPath)

      return reply.send({
        success: true,
        path: reqPath,
        content,
        encoding: 'utf-8',
        size: stats.size,
      })
    }
    catch (error) {
      logger.error('Failed to read file:', error)
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read file',
      })
    }
  })

  app.post('/api/files/write', { preHandler: requirePermission('files:write') }, async (request, reply) => {
    const { path: reqPath, content } = request.body as { path?: string, content?: string }

    if (!reqPath || content === undefined) {
      return reply.status(400).send({ success: false, error: 'Path and content are required' })
    }

    const { allowed, fullPath, error } = sanitizePath(reqPath)
    if (!allowed) {
      return reply.status(403).send({ success: false, error })
    }

    try {
      const contentBytes = new TextEncoder().encode(content)

      if (contentBytes.length > FILE_SIZE_LIMITS.edit) {
        return reply.status(413).send({
          success: false,
          error: `Content too large (max ${FILE_SIZE_LIMITS.edit / 1024 / 1024}MB)`,
        })
      }

      await runtimeFileIO.write(fullPath, content)
      logger.info(`File written: ${reqPath}`)

      return reply.send({ success: true })
    }
    catch (error) {
      logger.error('Failed to write file:', error)
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to write file',
      })
    }
  })

  app.post('/api/files/create', { preHandler: requirePermission('files:write') }, async (request, reply) => {
    const { path: reqPath, type, content = '' } = request.body as {
      path?: string
      type?: 'file' | 'directory'
      content?: string
    }

    if (!reqPath || !type) {
      return reply.status(400).send({ success: false, error: 'Path and type are required' })
    }

    const { allowed, fullPath, error } = sanitizePath(reqPath)
    if (!allowed) {
      return reply.status(403).send({ success: false, error })
    }

    try {
      if (type === 'directory') {
        await runtimeFileIO.mkdir(fullPath, { recursive: true })
        logger.info(`Directory created: ${reqPath}`)
      }
      else {
        await runtimeFileIO.mkdir(dirname(fullPath), { recursive: true })
        await runtimeFileIO.write(fullPath, content)
        logger.info(`File created: ${reqPath}`)
      }

      return reply.send({ success: true })
    }
    catch (error) {
      logger.error('Failed to create file/directory:', error)
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create',
      })
    }
  })
  /* c8 ignore stop */

  /* c8 ignore start */
  app.delete('/api/files/delete', { preHandler: requirePermission('files:delete') }, async (request, reply) => {
    const { path: reqPath, recursive = false } = request.body as {
      path?: string
      recursive?: boolean
    }

    if (!reqPath) {
      return reply.status(400).send({ success: false, error: 'Path is required' })
    }

    const { allowed, fullPath, error } = sanitizePath(reqPath)
    if (!allowed) {
      return reply.status(403).send({ success: false, error })
    }

    try {
      const stats = await runtimeFileIO.stat(fullPath)

      if (stats.isDirectory()) {
        await runtimeFileIO.remove(fullPath, { recursive, force: true })
      }
      else {
        await runtimeFileIO.unlink(fullPath)
      }

      logger.info(`Deleted: ${reqPath}`)
      return reply.send({ success: true })
    }
    catch (error) {
      logger.error('Failed to delete:', error)
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete',
      })
    }
  })

  app.post('/api/files/move', { preHandler: requirePermission('files:write') }, async (request, reply) => {
    const { from, to } = request.body as { from?: string, to?: string }

    if (!from || !to) {
      return reply.status(400).send({ success: false, error: 'From and to paths are required' })
    }

    const fromCheck = sanitizePath(from)
    const toCheck = sanitizePath(to)

    if (!fromCheck.allowed) {
      return reply.status(403).send({ success: false, error: `Source: ${fromCheck.error}` })
    }

    if (!toCheck.allowed) {
      return reply.status(403).send({ success: false, error: `Destination: ${toCheck.error}` })
    }

    try {
      await runtimeFileIO.rename(fromCheck.fullPath, toCheck.fullPath)
      logger.info(`Moved: ${from} -> ${to}`)

      return reply.send({ success: true })
    }
    catch (error) {
      logger.error('Failed to move:', error)
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to move',
      })
    }
  })

  app.get('/api/files/download', { preHandler: requirePermission('files:read') }, async (request, reply) => {
    const { path: reqPath } = request.query as { path?: string }

    if (!reqPath) {
      return reply.status(400).send({ success: false, error: 'Path is required' })
    }

    const { allowed, fullPath, error } = sanitizePath(reqPath)
    if (!allowed) {
      return reply.status(403).send({ success: false, error })
    }

    try {
      const stats = await runtimeFileIO.stat(fullPath)

      if (stats.isDirectory()) {
        return reply.status(400).send({ success: false, error: 'Cannot download directory (ZIP not implemented)' })
      }

      const filename = basename(fullPath)

      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      reply.header('Content-Type', 'application/octet-stream')

      const content = new Uint8Array(await runtimeFileIO.readBytes(fullPath))
      return reply.send(content)
    }
    catch (error) {
      logger.error('Failed to download:', error)
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to download',
      })
    }
  })

  app.post('/api/files/upload', { preHandler: requirePermission('files:write') }, async (request, reply) => {
    try {
      const data = await request.file()

      if (!data) {
        return reply.status(400).send({
          success: false,
          error: 'No file provided',
        })
      }

      const targetPath = (request.query as any).path || '/uploads'

      const { allowed, fullPath: targetDir, error } = sanitizePath(targetPath)
      if (!allowed) {
        return reply.status(403).send({ success: false, error })
      }

      await runtimeFileIO.mkdir(targetDir, { recursive: true })

      const filename = basename(data.filename.replaceAll('\\', '/'))
      if (!filename || filename === '.' || filename === '..') {
        return reply.status(400).send({
          success: false,
          error: 'Invalid file name',
        })
      }

      const fullPath = joinPath(targetDir, filename)

      let uploadedSize = 0
      const chunks: Uint8Array[] = []

      for await (const chunk of data.file) {
        const chunkBytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk)
        uploadedSize += chunkBytes.byteLength

        if (uploadedSize > FILE_SIZE_LIMITS.upload) {
          return reply.status(413).send({
            success: false,
            error: `File too large (max ${FILE_SIZE_LIMITS.upload / 1024 / 1024}MB)`,
          })
        }

        chunks.push(chunkBytes)
      }

      await runtimeFileIO.write(fullPath, concatBytes(...chunks))

      logger.info(`File uploaded: ${joinPath(targetPath, filename)} (${uploadedSize} bytes)`)

      return reply.send({
        success: true,
        path: joinPath(targetPath, filename),
        size: uploadedSize,
      })
    }
    catch (error) {
      logger.error('Failed to upload file:', error)
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload file',
      })
    }
  })
  /* c8 ignore stop */

  logger.info('✓ File manager routes registered')
}

export default registerFileManagerRoutes
