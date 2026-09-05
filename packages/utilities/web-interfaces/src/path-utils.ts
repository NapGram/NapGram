function normalizePath(value: string): string {
  const absolute = value.startsWith('/')
  const parts = value.split('/').filter(Boolean)
  const normalized: string[] = []
  for (const part of parts) {
    if (part === '.') continue
    if (part === '..') {
      if (normalized.at(-1) && normalized.at(-1) !== '..') normalized.pop()
      else if (!absolute) normalized.push(part)
    }
    else normalized.push(part)
  }
  const result = normalized.join('/')
  if (absolute) return `/${result}`
  return result || '.'
}

export function joinPath(...parts: string[]): string {
  return normalizePath(parts.filter(Boolean).join('/'))
}

export function resolvePath(...parts: string[]): string {
  const joined = parts.filter(Boolean).join('/')
  return normalizePath(joined.startsWith('/') ? joined : `/${joined}`)
}

export function dirname(filePath: string): string {
  const normalized = normalizePath(filePath)
  const index = normalized.lastIndexOf('/')
  return index > 0 ? normalized.slice(0, index) : normalized.startsWith('/') ? '/' : '.'
}

export function basename(filePath: string): string {
  const normalized = normalizePath(filePath)
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

export function extname(filePath: string): string {
  const name = basename(filePath)
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index) : ''
}

export function relativePath(from: string, to: string): string {
  const base = resolvePath(from).split('/').filter(Boolean)
  const target = resolvePath(to).split('/').filter(Boolean)
  let common = 0
  while (common < base.length && common < target.length && base[common] === target[common]) common++
  return [...base.slice(common).map(() => '..'), ...target.slice(common)].join('/') || ''
}

export function isAbsolute(filePath: string): boolean {
  return filePath.startsWith('/')
}

export function pathToFileURL(filePath: string): URL {
  return new URL(`file://${encodeURI(resolvePath(filePath))}`)
}
