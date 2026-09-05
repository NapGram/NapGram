function trimTrailingSeparators(value: string): string {
  return value.replace(/\/+$/, '') || '/'
}

export function joinPath(...parts: string[]): string {
  const nonEmpty = parts.filter(Boolean)
  if (!nonEmpty.length)
    return '.'
  const joined = nonEmpty.join('/').replace(/\\/g, '/')
  const absolute = joined.startsWith('/')
  const segments: string[] = []
  for (const segment of joined.split('/')) {
    if (!segment || segment === '.')
      continue
    if (segment === '..') {
      if (segments.length && segments.at(-1) !== '..')
        segments.pop()
      else if (!absolute)
        segments.push('..')
    }
    else {
      segments.push(segment)
    }
  }
  return `${absolute ? '/' : ''}${segments.join('/')}` || (absolute ? '/' : '.')
}

export function normalizePath(value: string): string {
  return joinPath(value)
}

export function resolvePath(base: string, value = '.'): string {
  return value.startsWith('/') ? normalizePath(value) : normalizePath(joinPath(base, value))
}

export function relativePath(base: string, value: string): string {
  const baseParts = normalizePath(base).split('/').filter(Boolean)
  const valueParts = normalizePath(value).split('/').filter(Boolean)
  let common = 0
  while (common < baseParts.length && common < valueParts.length && baseParts[common] === valueParts[common])
    common++
  return [...Array(baseParts.length - common).fill('..'), ...valueParts.slice(common)].join('/') || ''
}

export function isAbsolute(value: string): boolean {
  return value.startsWith('/')
}

export function basename(value: string): string {
  return trimTrailingSeparators(value).split('/').at(-1) || ''
}

export function dirname(value: string): string {
  const normalized = trimTrailingSeparators(value)
  const index = normalized.lastIndexOf('/')
  if (index < 0)
    return '.'
  return normalized.slice(0, index) || '/'
}

export function extname(value: string): string {
  const name = basename(value)
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index) : ''
}

export function parsePath(value: string): { name: string, ext: string, dir: string } {
  const name = basename(value)
  const ext = extname(name)
  return { name: ext ? name.slice(0, -ext.length) : name, ext, dir: dirname(value) }
}
