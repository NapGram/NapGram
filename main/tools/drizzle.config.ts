import type { Config } from 'drizzle-kit'

const path = (relativePath: string) => new URL(relativePath, import.meta.url).pathname

const runtimeSchemas = [
  path('./runtime-schemas/database/index.js'),
  path('./runtime-schemas/permission-management/schema.js'),
]

const workspaceSchemas = [
  path('../node_modules/@napgram/database/dist/schema/index.js'),
  path('../node_modules/@napgram/plugin-permission-management/dist/database/schema.js'),
]

// Drizzle Kit loads this config with require(), so schema discovery must be synchronous.
const runtimeFiles = new Set(new Bun.Glob('runtime-schemas/**/*.js').scanSync({
  cwd: import.meta.dir,
  absolute: true,
}))
const schema = runtimeSchemas.every(file => runtimeFiles.has(file)) ? runtimeSchemas : workspaceSchemas

export default {
  schema,
  out: path('./drizzle'),
  dialect: 'postgresql',
  dbCredentials: Bun.env.DATABASE_URL
    ? { url: Bun.env.DATABASE_URL }
    : undefined,
} satisfies Config
