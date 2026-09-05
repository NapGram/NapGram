export interface BunSpawnProcess {
  stdout?: { text(): Promise<string> } | null
  stderr?: { text(): Promise<string> } | null
  exited: Promise<number>
}

export interface BunSpawnRuntime {
  spawn(argv: string[], options?: {
    cwd?: string
    env?: Record<string, string | undefined>
    signal?: AbortSignal
    timeout?: number
    stdout?: 'pipe' | 'ignore' | 'inherit'
    stderr?: 'pipe' | 'ignore' | 'inherit'
  }): BunSpawnProcess
}

export interface BunSpawnResult {
  command: string[]
  stdout: string
  stderr: string
  exitCode: number
}

export class BunSpawnError extends Error {
  constructor(
    message: string,
    readonly result: BunSpawnResult,
  ) {
    super(message)
    this.name = 'BunSpawnError'
  }
}

function detectRuntime(): BunSpawnRuntime {
  const runtime = (globalThis as typeof globalThis & { Bun?: BunSpawnRuntime }).Bun
  if (!runtime) {
    throw new Error('Bun.spawn is unavailable; run this adapter under Bun')
  }
  return runtime
}

async function readOutput(stream: { text(): Promise<string> } | null | undefined): Promise<string> {
  return stream ? await stream.text() : ''
}

export async function spawnFileWithBun(
  command: string,
  args: string[] = [],
  options: {
    cwd?: string
    env?: Record<string, string | undefined>
    signal?: AbortSignal
    timeout?: number
  } = {},
  runtime: BunSpawnRuntime = detectRuntime(),
): Promise<BunSpawnResult> {
  const argv = [command, ...args]
  const process = runtime.spawn(argv, {
    ...options,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    readOutput(process.stdout),
    readOutput(process.stderr),
    process.exited,
  ])
  const result = { command: argv, stdout, stderr, exitCode }

  if (exitCode !== 0) {
    const detail = stderr.trim() || `exit code ${exitCode}`
    throw new BunSpawnError(`Command failed: ${command}: ${detail}`, result)
  }

  return result
}
