import { bootstrap, handleFatalStartupError } from './bootstrap.js'

export { bootstrap, handleFatalStartupError }

export async function main() {
  await bootstrap()
}

if (process.env.NAPGRAM_DISABLE_AUTO_MAIN !== '1' && !(import.meta as any).vitest) {
  void main().catch(handleFatalStartupError)
}
