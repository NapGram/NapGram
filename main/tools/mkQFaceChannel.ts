import fsP from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import qface from '../src/domain/constants/qface'

const BOT_TOKEN = process.argv[2]
const DIR = process.argv[3]
const CHANNEL = -1002431668959;

(async () => {
  for (const file of await fsP.readdir(DIR)) {
    if (!file.endsWith('.webm'))
      continue

    const id = file.replace(/\.webm$/, '')
    const name = qface[id]

    const resTitle = await wrap429(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: CHANNEL,
        text: `${id}: ${name}`,
      }),
    })
    const titleId = resTitle.result.message_id
    console.log(`'${id}': ${titleId}`)

    const frm = new FormData()
    frm.append('chat_id', CHANNEL.toString())
    frm.append('reply_parameters', JSON.stringify({
      message_id: titleId,
    }))
    frm.append('sticker', new Blob([await fsP.readFile(path.join(DIR, file))]), 'sticker.webm')
    await wrap429(`https://api.telegram.org/bot${BOT_TOKEN}/sendSticker`, {
      method: 'POST',
      body: frm,
    })
  }
})()

async function wrap429(url: string, ext: any) {
  const req = await fetch(url, ext)
  const res = await req.json()
  if (res.ok)
    return res
  if (res.error_code !== 429)
    throw res
  const wait = res.parameters.retry_after
  console.log(`429: waiting ${wait} seconds`)
  await new Promise(resolve => setTimeout(resolve, wait * 1000))
  return wrap429(url, ext)
}
