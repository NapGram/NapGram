/**
 * 消息片段
 */
export type MessageSegment
    = | TextSegment
    | AtSegment
    | ReplySegment
    | ImageSegment
    | VideoSegment
    | AudioSegment
    | FileSegment
    | ForwardSegment
    | FaceSegment
    | RawSegment

export interface TextSegment {
    type: 'text'
    data: {
        text: string
    }
}

export interface AtSegment {
    type: 'at'
    data: {
        userId: string
        userName?: string
    }
}

export interface ReplySegment {
    type: 'reply'
    data: {
        messageId: string
        senderId?: string
        userId?: string
    }
}

export interface ImageSegment {
    type: 'image'
    data: {
        /** 图片 URL */
        url?: string
        /** 本地文件路径 */
        file?: string
        /** Base64 编码的图片数据 */
        base64?: string
    }
}

export interface VideoSegment {
    type: 'video'
    data: {
        url?: string
        file?: string
    }
}

export interface AudioSegment {
    type: 'audio'
    data: {
        url?: string
        file?: string
    }
}

export interface FaceSegment {
    type: 'face'
    data: {
        id: string
        text?: string
    }
}

export interface FileSegment {
    type: 'file'
    data: {
        url?: string
        file?: string
        name?: string
    }
}

export interface ForwardSegment {
    type: 'forward'
    data: {
        messages: ForwardMessage[]
    }
}

export interface ForwardMessage {
    userId: string
    userName: string
    segments: MessageSegment[]
}

export interface RawSegment {
    type: 'raw'
    data: {
        platform: 'qq' | 'tg'
        content: any
    }
}
