import { db, eq, schema } from '@napgram/db-kit'
import { env } from '@napgram/env-kit'
import { getLogger } from '@napgram/logger-kit'
import { convert } from '@napgram/media-kit'
import type { IInstance as Instance } from '@napgram/runtime-kit'

export type { Instance }
export { db, schema, eq, env, getLogger, convert }

// QQ face emoji map — loaded from infra-kit's qface data if available at runtime
export const qface: Record<number, string> = {}
