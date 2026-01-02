/**
 * 文本类型消息段转换器
 */
export class TextSegmentConverter {
    convertText(data) {
        return {
            type: 'text',
            data: { text: data.text },
        };
    }
    convertShare(data, rawMessage) {
        return {
            type: 'text',
            data: {
                text: data.url || data.file || rawMessage || '[分享]',
            },
        };
    }
    convertPoke(data) {
        return {
            type: 'text',
            data: {
                text: `[戳一戳] ${data.name || ''}`.trim(),
            },
        };
    }
    convertMarkdown(data, segment) {
        return {
            type: 'text',
            data: {
                text: data.text || data.content || JSON.stringify(segment.data),
            },
        };
    }
}
