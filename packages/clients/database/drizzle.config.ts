import type { Config } from 'drizzle-kit';

export default {
    schema: ['./src/schema/main.ts'],
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url: (globalThis as typeof globalThis & { Bun: { env: Record<string, string | undefined> } }).Bun.env.DATABASE_URL!,
    },
} satisfies Config;
