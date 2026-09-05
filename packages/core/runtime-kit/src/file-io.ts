export interface BunFileWriterLike {
  write(data: string | Uint8Array | ArrayBuffer): number | Promise<number>
  end(): number | Promise<number> | ArrayBuffer | Uint8Array
}

export interface BunGlobRuntime {
  scan(options?: { cwd?: string, dot?: boolean, onlyFiles?: boolean }): AsyncIterable<string>
}

export interface BunFileProcess {
  stdout?: { text(): Promise<string> } | null
  stderr?: { text(): Promise<string> } | null
  exited: Promise<number>
}

export interface BunFileSpawnRuntime {
  spawn(argv: string[], options?: {
    stdout?: 'pipe' | 'ignore' | 'inherit'
    stderr?: 'pipe' | 'ignore' | 'inherit'
  }): BunFileProcess
}

export interface BunFileLike {
  bytes(): Promise<Uint8Array>
  text(): Promise<string>
  exists(): Promise<boolean>
  stat?(): Promise<FileStatLike>
  writer?(): BunFileWriterLike
  unlink?(): Promise<void>
}

export interface BunFileRuntime {
  file(path: string): BunFileLike
  write(path: string, data: string | Uint8Array | ArrayBuffer | Blob | BunFileLike): Promise<number>
  Glob?: new (pattern: string) => BunGlobRuntime
  spawn?: BunFileSpawnRuntime['spawn']
}

export interface FileStatLike {
  size: number
  mtime: Date
  mode: number
  isDirectory(): boolean
  isFile?(): boolean
}

export interface FileDirentLike {
  name: string
  isDirectory(): boolean
  isFile(): boolean
}

export interface FileWriterLike {
  write(data: string | Uint8Array | ArrayBuffer | Blob): Promise<number>
  close(): Promise<void>
}

export interface BunFileIO {
  readBytes(path: string): Promise<Uint8Array>
  readText(path: string): Promise<string>
  write(path: string, data: string | Uint8Array | ArrayBuffer | Blob): Promise<number>
  copyFile(from: string, to: string): Promise<void>
  openWrite(path: string): Promise<FileWriterLike>
  exists(path: string): Promise<boolean>
  access(path: string): Promise<void>
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
  mkdtemp(prefix: string): Promise<string>
  stat(path: string): Promise<FileStatLike>
  readdir(path: string): Promise<string[]>
  readdirEntries(path: string): Promise<FileDirentLike[]>
  remove(path: string, options?: { recursive?: boolean, force?: boolean }): Promise<void>
  unlink(path: string): Promise<void>
  rename(from: string, to: string): Promise<void>
}

function detectRuntime(): BunFileRuntime | undefined {
  return (globalThis as typeof globalThis & { Bun?: BunFileRuntime }).Bun
}

function joinPath(directory: string, name: string): string {
  if (!directory) return name
  if (!name) return directory
  return `${directory.replace(/[\\/]+$/, '')}/${name.replace(/^[/\\]+/, '')}`
}

async function runBunCommand(runtime: BunFileRuntime, argv: string[]): Promise<string> {
  if (!runtime.spawn)
    throw new Error('Bun.spawn is unavailable; run this adapter under Bun')
  const process = runtime.spawn(argv, { stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, exitCode] = await Promise.all([
    process.stdout?.text() ?? Promise.resolve(''),
    process.stderr?.text() ?? Promise.resolve(''),
    process.exited,
  ])
  if (exitCode !== 0) {
    const detail = stderr.trim() || `exit code ${exitCode}`
    throw new Error(`Bun filesystem command failed: ${argv[0]}: ${detail}`)
  }
  return stdout
}

async function listDirectoryNames(runtime: BunFileRuntime, path: string): Promise<string[]> {
  if (!runtime.Glob)
    throw new Error('Bun.Glob is unavailable; run this adapter under Bun')
  const glob = new runtime.Glob('*')
  return await Array.fromAsync(glob.scan({ cwd: path, dot: true, onlyFiles: false }))
}

export function isBunFileIOAvailable(): boolean {
  return detectRuntime() !== undefined
}

export function createBunFileIO(runtime: BunFileRuntime | undefined = detectRuntime()): BunFileIO {
  if (!runtime) {
    throw new Error('Bun.file/Bun.write are unavailable; run this adapter under Bun')
  }

  return {
    async readBytes(path) {
      return await runtime.file(path).bytes()
    },
    async readText(path) {
      return await runtime.file(path).text()
    },
    async write(path, data) {
      return await runtime.write(path, data)
    },
    async copyFile(from, to) {
      await runtime.write(to, runtime.file(from))
    },
    async openWrite(path) {
      const file = runtime.file(path)
      if (await file.exists()) {
        if (file.unlink)
          await file.unlink()
        else
          await runBunCommand(runtime, ['rm', '--', path])
      }
      const sink = file.writer?.()
      if (!sink)
        throw new Error('Bun FileSink is unavailable; run this adapter under Bun')
      return {
        async write(data) {
          const value = data instanceof Blob ? await data.arrayBuffer() : data
          return await sink.write(value)
        },
        async close() {
          await sink.end()
        },
      }
    },
    async exists(path) {
      const file = runtime.file(path)
      if (await file.exists())
        return true
      try {
        const stat = await file.stat?.()
        return stat !== undefined
      }
      catch {
        return false
      }
    },
    async access(path) {
      const file = runtime.file(path)
      if (await file.exists())
        return
      try {
        if (await file.stat?.())
          return
      }
      catch {
        // Report the same missing-path error below.
      }
      throw new Error(`Bun file does not exist: ${path}`)
    },
    async mkdir(path, options) {
      await runBunCommand(runtime, ['mkdir', ...(options?.recursive ? ['-p'] : []), '--', path])
    },
    async mkdtemp(prefix) {
      return (await runBunCommand(runtime, ['mktemp', '-d', '--', `${prefix}XXXXXX`])).trim()
    },
    async stat(path) {
      const stat = await runtime.file(path).stat?.()
      if (!stat)
        throw new Error(`Bun file stat is unavailable: ${path}`)
      return stat
    },
    async readdir(path) {
      return await listDirectoryNames(runtime, path)
    },
    async readdirEntries(path) {
      const names = await listDirectoryNames(runtime, path)
      return await Promise.all(names.map(async (name) => {
        const stat = await runtime.file(joinPath(path, name)).stat?.()
        if (!stat)
          throw new Error(`Bun file stat is unavailable for directory entry: ${name}`)
        return {
          name,
          isDirectory: () => stat.isDirectory(),
          isFile: () => stat.isFile?.() ?? !stat.isDirectory(),
        }
      }))
    },
    async remove(path, options) {
      const flags = `${options?.recursive ? 'r' : ''}${options?.force ? 'f' : ''}`
      await runBunCommand(runtime, ['rm', ...(flags ? [`-${flags}`] : []), '--', path])
    },
    async unlink(path) {
      const file = runtime.file(path)
      if (file.unlink)
        await file.unlink()
      else
        await runBunCommand(runtime, ['rm', '--', path])
    },
    async rename(from, to) {
      await runBunCommand(runtime, ['mv', '--', from, to])
    },
  }
}

export function createRuntimeFileIO(runtime: BunFileRuntime | undefined = detectRuntime()): BunFileIO {
  return createBunFileIO(runtime)
}

export const runtimeFileIO = createRuntimeFileIO()
