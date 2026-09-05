import { dirname, joinPath } from '../../src/shared/utils/path.js'

const coreEntry = Bun.resolveSync('@mtcute/core', import.meta.dir)
const schemaPath = joinPath(dirname(coreEntry), 'tl', 'api-schema.json')

export default await Bun.file(schemaPath).json()
