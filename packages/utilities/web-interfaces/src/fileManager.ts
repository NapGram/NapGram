import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import { authMiddleware } from '@napgram/auth-kit'
import { getLogger } from './web-deps.js'

const logger = getLogger('FileAPI')

export default function registerRoutes(app: FastifyInstance) {
    registerFileManagerRoutes(app)
}

// 容器内的数据根目录
const DATA_ROOT = process.env.FILE_MANAGER_ROOT || '/app/data'

// 文件大小限制（字节）
const FILE_SIZE_LIMITS = {
    read: 10 * 1024 * 1024,      // 10MB
    upload: 100 * 1024 * 1024,   // 100MB
    edit: 5 * 1024 * 1024,       // 5MB
}

/**
 * 路径安全验证 - 防止路径遍历攻击
 */
function sanitizePath(userPath: string): { allowed: boolean; fullPath: string; error?: string } {
    try {
        const normalized = path.normalize(userPath)
        const fullPath = path.resolve(DATA_ROOT, normalized.startsWith('/') ? normalized.slice(1) : normalized)

        if (!fullPath.startsWith(DATA_ROOT)) {
            return { allowed: false, fullPath: '', error: 'Access denied: path outside allowed root' }
        }

        return { allowed: true, fullPath }
    } catch (error) {
        return { allowed: false, fullPath: '', error: error instanceof Error ? error.message : 'Invalid path' }
    }
}

/**
 * 注册文件管理API路由
 */
// 这里只做认证，后续再接入细粒度权限
function requireAuth() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        await authMiddleware(request, reply)

        const auth = (request as any).auth

        if (auth?.type === 'env' || auth?.type === 'token') {
            return
        }
    }
}

/**
 * 注册文件管理API路由
 */
export function registerFileManagerRoutes(app: FastifyInstance) {
    // 1. 列出目录内容
    app.get('/api/files/list', { preHandler: requireAuth() }, async (request, reply) => {
        const { path: reqPath } = request.query as { path?: string }

        if (!reqPath) {
            return reply.status(400).send({ success: false, error: 'Path is required' })
        }

        const { allowed, fullPath, error } = sanitizePath(reqPath)
        if (!allowed) {
            return reply.status(403).send({ success: false, error })
        }

        try {
            const entries = await fs.readdir(fullPath, { withFileTypes: true })
            const files = await Promise.all(
                entries.map(async (entry) => {
                    try {
                        const entryPath = path.join(fullPath, entry.name)
                        const stats = await fs.stat(entryPath)
                        return {
                            name: entry.name,
                            path: path.join(reqPath, entry.name),
                            type: entry.isDirectory() ? 'directory' : 'file',
                            size: stats.size,
                            modified: stats.mtime.toISOString(),
                            permissions: '0' + (stats.mode & parseInt('777', 8)).toString(8),
                        }
                    } catch (err) {
                        logger.warn(`Failed to stat ${entry.name}:`, err)
                        return null
                    }
                })
            )

            return reply.send({
                success: true,
                path: reqPath,
                files: files.filter((f): f is NonNullable<typeof f> => f !== null)
            })
        } catch (error) {
            logger.error('Failed to list files:', error)
            return reply.status(500).send({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to list files'
            })
        }
    })

    // 2. 读取文件内容
    app.get('/api/files/read', { preHandler: requireAuth() }, async (request, reply) => {
        const { path: reqPath } = request.query as { path?: string }

        if (!reqPath) {
            return reply.status(400).send({ success: false, error: 'Path is required' })
        }

        const { allowed, fullPath, error } = sanitizePath(reqPath)
        if (!allowed) {
            return reply.status(403).send({ success: false, error })
        }

        try {
            const stats = await fs.stat(fullPath)

            if (stats.isDirectory()) {
                return reply.status(400).send({ success: false, error: 'Cannot read directory' })
            }

            if (stats.size > FILE_SIZE_LIMITS.read) {
                return reply.status(413).send({
                    success: false,
                    error: `File too large (max ${FILE_SIZE_LIMITS.read / 1024 / 1024}MB)`
                })
            }

            const content = await fs.readFile(fullPath, 'utf-8')

            return reply.send({
                success: true,
                path: reqPath,
                content,
                encoding: 'utf-8',
                size: stats.size
            })
        } catch (error) {
            logger.error('Failed to read file:', error)
            return reply.status(500).send({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to read file'
            })
        }
    })

    // 3. 写入文件
    app.post('/api/files/write', { preHandler: requireAuth() }, async (request, reply) => {
        const { path: reqPath, content } = request.body as { path?: string; content?: string }

        if (!reqPath || content === undefined) {
            return reply.status(400).send({ success: false, error: 'Path and content are required' })
        }

        const { allowed, fullPath, error } = sanitizePath(reqPath)
        if (!allowed) {
            return reply.status(403).send({ success: false, error })
        }

        try {
            const contentBuffer = Buffer.from(content, 'utf-8')

            if (contentBuffer.length > FILE_SIZE_LIMITS.edit) {
                return reply.status(413).send({
                    success: false,
                    error: `Content too large (max ${FILE_SIZE_LIMITS.edit / 1024 / 1024}MB)`
                })
            }

            await fs.writeFile(fullPath, content, 'utf-8')
            logger.info(`File written: ${reqPath}`)

            return reply.send({ success: true })
        } catch (error) {
            logger.error('Failed to write file:', error)
            return reply.status(500).send({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to write file'
            })
        }
    })

    // 4. 创建文件或目录
    app.post('/api/files/create', { preHandler: requireAuth() }, async (request, reply) => {
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
                await fs.mkdir(fullPath, { recursive: true })
                logger.info(`Directory created: ${reqPath}`)
            } else {
                await fs.mkdir(path.dirname(fullPath), { recursive: true })
                await fs.writeFile(fullPath, content, 'utf-8')
                logger.info(`File created: ${reqPath}`)
            }

            return reply.send({ success: true })
        } catch (error) {
            logger.error('Failed to create file/directory:', error)
            return reply.status(500).send({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create'
            })
        }
    })

    // 5. 删除文件或目录
    app.delete('/api/files/delete', { preHandler: requireAuth() }, async (request, reply) => {
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
            const stats = await fs.stat(fullPath)

            if (stats.isDirectory()) {
                await fs.rm(fullPath, { recursive, force: true })
            } else {
                await fs.unlink(fullPath)
            }

            logger.info(`Deleted: ${reqPath}`)
            return reply.send({ success: true })
        } catch (error) {
            logger.error('Failed to delete:', error)
            return reply.status(500).send({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to delete'
            })
        }
    })

    // 6. 移动/重命名
    app.post('/api/files/move', { preHandler: requireAuth() }, async (request, reply) => {
        const { from, to } = request.body as { from?: string; to?: string }

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
            await fs.rename(fromCheck.fullPath, toCheck.fullPath)
            logger.info(`Moved: ${from} -> ${to}`)

            return reply.send({ success: true })
        } catch (error) {
            logger.error('Failed to move:', error)
            return reply.status(500).send({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to move'
            })
        }
    })

    // 7. 下载文件
    app.get('/api/files/download', { preHandler: requireAuth() }, async (request, reply) => {
        const { path: reqPath } = request.query as { path?: string }

        if (!reqPath) {
            return reply.status(400).send({ success: false, error: 'Path is required' })
        }

        const { allowed, fullPath, error } = sanitizePath(reqPath)
        if (!allowed) {
            return reply.status(403).send({ success: false, error })
        }

        try {
            const stats = await fs.stat(fullPath)

            if (stats.isDirectory()) {
                return reply.status(400).send({ success: false, error: 'Cannot download directory (ZIP not implemented)' })
            }

            const filename = path.basename(fullPath)

            reply.header('Content-Disposition', `attachment; filename="${filename}"`)
            reply.header('Content-Type', 'application/octet-stream')

            const stream = await fs.readFile(fullPath)
            return reply.send(stream)
        } catch (error) {
            logger.error('Failed to download:', error)
            return reply.status(500).send({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to download'
            })
        }
    })

    // 8. 上传文件
    app.post('/api/files/upload', { preHandler: requireAuth() }, async (request, reply) => {
        try {
            const uploadRequest = request as FastifyRequest & { file: () => Promise<{ filename: string; file: AsyncIterable<Buffer> }> }
            const data = await uploadRequest.file()

            if (!data) {
                return reply.status(400).send({
                    success: false,
                    error: 'No file provided'
                })
            }

            // 从查询参数获取目标路径
            const targetPath = (request.query as any).path || '/uploads'

            const { allowed, fullPath: targetDir, error } = sanitizePath(targetPath)
            if (!allowed) {
                return reply.status(403).send({ success: false, error })
            }

            // 确保目标目录存在
            await fs.mkdir(targetDir, { recursive: true })

            // 构建完整文件路径
            const filename = data.filename
            const fullPath = path.join(targetDir, filename)

            // 检查文件大小
            let uploadedSize = 0

            const writeStream = createWriteStream(fullPath)

            // 监控上传大小
            for await (const chunk of data.file) {
                uploadedSize += chunk.length

                if (uploadedSize > FILE_SIZE_LIMITS.upload) {
                    writeStream.destroy()
                    // 删除部分上传的文件
                    await fs.unlink(fullPath).catch(() => { })

                    return reply.status(413).send({
                        success: false,
                        error: `File too large (max ${FILE_SIZE_LIMITS.upload / 1024 / 1024}MB)`
                    })
                }

                writeStream.write(chunk)
            }

            writeStream.end()

            logger.info(`File uploaded: ${path.join(targetPath, filename)} (${uploadedSize} bytes)`)

            return reply.send({
                success: true,
                path: path.join(targetPath, filename),
                size: uploadedSize
            })
        } catch (error) {
            logger.error('Failed to upload file:', error)
            return reply.status(500).send({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to upload file'
            })
        }
    })

    logger.info('✓ File manager routes registered')
}
