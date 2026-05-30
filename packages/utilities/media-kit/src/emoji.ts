import { random } from './shared-runtime.js'

export default {
  picture: () => random.pick('🎆', '🌃', '🌇', '🎇', '🌌', '🌠', '🌅', '🌉', '🏞', '🌆', '🌄', '🖼', '🗾', '🎑', '🏙', '🌁'),
  color(index: number) {
    const arr = [...new Intl.Segmenter().segment('🔴🟠🟡🟢🔵🟣⚫️⚪️🟤')].map(x => x.segment)
    index = index % arr.length
    return arr[index]
  },
  tgColor(index: number) {
    if (index < 0) {
      const str = index.toString()
      if (str.startsWith('-100')) {
        index = Number(str.slice(4))
      }
      else {
        index = -index
      }
    }
    // https://github.com/telegramdesktop/tdesktop/blob/7049929a59176a996c4257d5a09df08b04ac3b22/Telegram/SourceFiles/ui/chat/chat_style.cpp#L1043
    // https://github.com/LyoSU/quote-api/blob/master/utils/quote-generate.js#L163
    const arr = [...new Intl.Segmenter().segment('❤️🧡💜💚🩵💙🩷')].map(x => x.segment)
    index = index % arr.length
    return arr[index]
  },
}
