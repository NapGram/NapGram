type SqlState = 'normal' | 'single' | 'double' | 'line' | 'block' | 'dollar'

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let start = 0
  let index = 0
  let state: SqlState = 'normal'
  let dollarTag = ''
  let blockDepth = 0

  while (index < sql.length) {
    const char = sql[index]!
    const next = sql[index + 1]

    if (state === 'normal') {
      if (char === '-' && next === '-') { state = 'line'; index += 2; continue }
      if (char === '/' && next === '*') { state = 'block'; blockDepth = 1; index += 2; continue }
      if (char === "'") { state = 'single'; index++; continue }
      if (char === '"') { state = 'double'; index++; continue }
      if (char === '$') {
        const match = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)
        if (match) { state = 'dollar'; dollarTag = match[0]; index += dollarTag.length; continue }
      }
      if (char === ';') {
        const statement = sql.slice(start, index).trim()
        if (statement) statements.push(statement)
        start = index + 1
      }
      index++
      continue
    }

    if (state === 'single') {
      if (char === "'" && next === "'") { index += 2; continue }
      if (char === "'") { state = 'normal'; index++; continue }
      if (char === '\\' && index + 1 < sql.length) { index += 2; continue }
      index++
      continue
    }

    if (state === 'double') {
      if (char === '"' && next === '"') { index += 2; continue }
      if (char === '"') { state = 'normal'; index++; continue }
      index++
      continue
    }

    if (state === 'line') {
      if (char === '\n') state = 'normal'
      index++
      continue
    }

    if (state === 'block') {
      if (char === '/' && next === '*') { blockDepth++; index += 2; continue }
      if (char === '*' && next === '/') {
        blockDepth--
        index += 2
        if (blockDepth === 0) state = 'normal'
        continue
      }
      index++
      continue
    }

    if (state === 'dollar') {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length
        state = 'normal'
        continue
      }
      index++
    }
  }

  const tail = sql.slice(start).trim()
  if (tail) statements.push(tail)
  if (state === 'single' || state === 'double' || state === 'block' || state === 'dollar') {
    throw new Error(`Unterminated SQL lexical state: ${state}`)
  }
  return statements
}
