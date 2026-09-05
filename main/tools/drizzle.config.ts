import type { Config } from 'drizzle-kit'

const path = (relativePath: string) => new URL(relativePath, import.meta.url).pathname
const exists = async (filePath: string) => await Bun.file(filePath).exists()

const runtimeSchemas = [
  path('./runtime-schemas/database/index.js'),
  path('./runtime-schemas/permission-management/schema.js'),
]

const workspaceSchemas = [
  path('../node_modules/@napgram/database/dist/schema/index.js'),
  path('../node_modules/@napgram/plugin-permission-management/dist/database/schema.js'),
]

const hasAll = async (candidates: string[]) => (await Promise.all(candidates.map(exists))).every(Boolean)
const schema = await (await hasAll(runtimeSchemas) ? runtimeSchemas : await hasAll(workspaceSchemas) ? workspaceSchemas : workspaceSchemas)

export default {
  schema,
  out: path('./drizzle'),
  dialect: 'postgresql',
  dbCredentials: {
    url: Bun.env.DATABASE_URL,
  },
} satisfies Config
