import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const coreEntry = require.resolve('@mtcute/core')
const schemaPath = path.join(path.dirname(coreEntry), 'tl', 'api-schema.json')

export default JSON.parse(readFileSync(schemaPath, 'utf8'))
