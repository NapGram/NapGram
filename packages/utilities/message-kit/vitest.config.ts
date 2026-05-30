import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = fileURLToPath(new URL('../..', import.meta.url))
const packageSrc = (...segments: string[]) =>
    path.resolve(rootDir, ...segments, 'src', 'index.ts')
const coreSrc = (name: string) => packageSrc('core', name)
const utilitySrc = (name: string) => packageSrc('utilities', name)
const clientSrc = (name: string) => packageSrc('clients', name)

export default defineConfig({
    resolve: {
        alias: {
            '@napgram/feature-kit': utilitySrc('feature-kit'),
            '@napgram/gateway-kit': utilitySrc('gateway-kit'),
            '@napgram/infra-kit': coreSrc('infra-kit'),
            '@napgram/auth-kit': utilitySrc('auth-kit'),
            '@napgram/media-kit': utilitySrc('media-kit'),
            '@napgram/message-kit': utilitySrc('message-kit'),
            '@napgram/marketplace-kit': utilitySrc('marketplace-kit'),
            '@napgram/request-kit': utilitySrc('request-kit'),
            '@napgram/runtime-kit': coreSrc('runtime-kit'),
            '@napgram/qq-client': clientSrc('qq-client'),
            '@napgram/telegram-client': clientSrc('telegram-client'),
            '@napgram/database': clientSrc('database'),
            '@napgram/web-interfaces': utilitySrc('web-interfaces'),
        },
    },
    test: {
        include: ['src/**/__tests__/**/*.test.*'],
        globals: true,
        environment: 'node',
        exclude: ['dist/**', 'node_modules/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
        },
    },
})
