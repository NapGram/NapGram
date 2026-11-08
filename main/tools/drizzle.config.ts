import type { Config } from 'drizzle-kit'

const path = (relativePath: string) => new URL(relativePath, import.meta.url).pathname

export default {
  out: path('./drizzle'),
  dialect: 'postgresql',
  dbCredentials: {
    url: Bun.env.DATABASE_URL,
  },
} satisfies Config
