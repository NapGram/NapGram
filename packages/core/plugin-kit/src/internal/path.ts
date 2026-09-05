const separator = '/'

export interface PluginKitBunRuntime {
  cwd: string
  env: Record<string, string | undefined>
  fileURLToPath(input: URL): string
  pathToFileURL(input: string): URL
}

export const bunRuntime = (globalThis as typeof globalThis & { Bun: PluginKitBunRuntime }).Bun

export function normalizePath(input: string): string {
  const absolute = input.startsWith(separator)
  const parts: string[] = []
  for (const part of input.replaceAll('\\', separator).split(separator)) {
    if (!part || part === '.')
      continue
    if (part === '..') {
      if (parts.length && parts[parts.length - 1] !== '..')
        parts.pop()
      else if (!absolute)
        parts.push(part)
      continue
    }
    parts.push(part)
  }
  const result = parts.join(separator)
  if (absolute)
    return result ? `${separator}${result}` : separator
  return result || '.'
}

export function resolvePath(...parts: string[]): string {
  let combined = ''
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]
    if (!part)
      continue
    combined = combined ? `${part}${separator}${combined}` : part
    if (part.startsWith(separator))
      break
  }
  if (!combined.startsWith(separator))
    combined = `${bunRuntime.cwd}${separator}${combined}`
  return normalizePath(combined)
}

export function joinPath(...parts: string[]): string {
  const nonEmpty = parts.filter(Boolean)
  return nonEmpty.length ? normalizePath(nonEmpty.join(separator)) : '.'
}

export function dirname(input: string): string {
  const normalized = normalizePath(input)
  if (normalized === separator)
    return separator
  const index = normalized.lastIndexOf(separator)
  if (index < 0)
    return '.'
  return index === 0 ? separator : normalized.slice(0, index)
}

export function basename(input: string, suffix?: string): string {
  if (!input)
    return ''
  const normalized = normalizePath(input)
  const base = normalized.slice(normalized.lastIndexOf(separator) + 1)
  return suffix && base.endsWith(suffix) ? base.slice(0, -suffix.length) : base
}

export function extname(input: string): string {
  const base = basename(input)
  if (!base || base === '.' || base === '..')
    return ''
  const index = base.lastIndexOf('.')
  if (index <= 0)
    return index === 0 && base.indexOf('.', 1) >= 0 ? base.slice(index) : ''
  return base.slice(index)
}

export function isAbsolute(input: string): boolean {
  return input.startsWith(separator)
}

export function relative(from: string, to: string): string {
  const fromParts = resolvePath(from).slice(1).split(separator).filter(Boolean)
  const toParts = resolvePath(to).slice(1).split(separator).filter(Boolean)
  let common = 0
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common])
    common++
  return [
    ...Array.from({ length: fromParts.length - common }, () => '..'),
    ...toParts.slice(common),
  ].join(separator)
}

export function fileURLToPath(input: string): string {
  const url = new URL(input)
  if (url.protocol !== 'file:')
    throw new Error(`Unsupported module URL: ${input}`)
  return bunRuntime.fileURLToPath(url)
}

export function pathToFileURL(input: string): string {
  return bunRuntime.pathToFileURL(input).href
}

export function isWithin(root: string, target: string): boolean {
  const normalizedRoot = resolvePath(root)
  const normalizedTarget = resolvePath(target)
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${separator}`)
}
