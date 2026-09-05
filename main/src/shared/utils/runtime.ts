export const bunEnv = (globalThis as typeof globalThis & {
  Bun: { env: Record<string, string | undefined> }
}).Bun.env


type BunSignal = 'SIGINT' | 'SIGTERM'
type BunSignalListener = () => void

type BunProcessRuntime = {
  on(signal: BunSignal, listener: BunSignalListener): unknown
}

const bunProcess = (globalThis as typeof globalThis & {
  process: BunProcessRuntime
}).process

export function onBunSignal(signal: BunSignal, listener: BunSignalListener): void {
  bunProcess.on(signal, listener)
}
