import process from 'node:process'

async function main() {
  process.env.TG_API_ID ??= '1'
  process.env.TG_API_HASH ??= 'bundle-smoke'
  process.env.TG_BOT_TOKEN ??= 'bundle-smoke'
  process.env.NAPGRAM_DISABLE_AUTO_MAIN = '1'

  await import('../build/index.js')

  console.log('Production bundle imported successfully')
  process.exit(0)
}

void main()
