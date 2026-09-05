/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import { bootstrap, handleFatalStartupError } from './bootstrap.js'
import { bunEnv } from './shared/utils/runtime.js'

export { bootstrap, handleFatalStartupError }

export async function main() {
  await bootstrap()
}

if (bunEnv.NAPGRAM_DISABLE_AUTO_MAIN !== '1') {
  void main().catch(handleFatalStartupError)
}
