async function main() {
  Bun.env.TG_API_ID ??= '1'
  Bun.env.TG_API_HASH ??= 'bundle-smoke'
  Bun.env.TG_BOT_TOKEN ??= 'bundle-smoke'
  Bun.env.NAPGRAM_DISABLE_AUTO_MAIN = '1'

  await import('../build/index.js')

  console.log('Production bundle imported successfully')
}

await main()
