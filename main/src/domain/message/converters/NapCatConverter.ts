import { BaseConverter } from './BaseConverter';
import type { UnifiedMessage, MessageContent } from '../types';
import qface from '../../constants/qface';

export class NapCatConverter extends BaseConverter {
    /**
     * 从 NapCat 消息转换为统一格式
     */
    fromNapCat(napCatMsg: any): UnifiedMessage {
        this.logger.info(`Converting from NapCat: ${napCatMsg.message_id}`);
        this.logger.debug(`Converting NapCat message segments:\n${JSON.stringify(napCatMsg.message, null, 2)}`);

        const content: MessageContent[] = [];

        // 解析消息内容
        if (napCatMsg.message) {
            for (const segment of napCatMsg.message) {
                const converted = this.convertNapCatSegment(segment, napCatMsg);
                if (!converted) continue;
                if (Array.isArray(converted)) {
                    content.push(...converted);
                } else {
                    content.push(converted);
                }
            }
        }

        // 提取发送者名称：优先使用群名片，如果为空则使用昵称
        const senderCard = napCatMsg.sender?.card?.trim();
        const senderNickname = napCatMsg.sender?.nickname?.trim();
        const senderName = (senderCard && senderCard.length > 0) ? senderCard : (senderNickname || 'Unknown');

        return {
            id: String(napCatMsg.message_id),
            platform: 'qq',
            sender: {
                id: String(napCatMsg.sender?.user_id || napCatMsg.user_id),
                name: senderName,
                avatar: napCatMsg.sender?.avatar,
            },
            chat: {
                id: String(napCatMsg.group_id || napCatMsg.user_id),
                type: napCatMsg.message_type === 'group' ? 'group' : 'private',
                name: napCatMsg.group_name,
            },
            content,
            timestamp: napCatMsg.time * 1000,
            metadata: {
                raw: napCatMsg,
                messageType: napCatMsg.message_type,
                subType: napCatMsg.sub_type,
            },
        };
    }

    private convertNapCatSegment(segment: any, rawMsg?: any): MessageContent | MessageContent[] | null {
        this.logger.debug(`Converting segment:\n${JSON.stringify(segment, null, 2)}`);
        const data: any = segment?.data || {};
        const type = (segment?.type || '') as string;
        const rawMessage: string | undefined = rawMsg?.raw_message;

        switch (type) {
            case 'text':
                return {
                    type: 'text',
                    data: { text: data.text },
                };

            case 'image':
                {
                    const httpUrl = (data.url && /^https?:/.test(data.url)) ? data.url : undefined;
                    const httpFile = (data.file && /^https?:/.test(data.file)) ? data.file : undefined;
                    const url = httpUrl || httpFile || data.url || data.file;
                    return {
                        type: 'image',
                        data: {
                            url,
                            file: httpUrl || data.file,
                            isSpoiler: data.sub_type && parseInt(data.sub_type) > 0,
                        },
                    };
                }

            case 'video':
                {
                    let url = data.url || data.file;
                    // 优先从 raw_message 提取真实视频 URL（data.url/file 可能是缩略图）
                    if (rawMessage) {
                        const m = rawMessage.match(/url=([^,\]]+)/);
                        if (m && m[1]) {
                            url = m[1].replace(/&amp;/g, '&'); // 解码 HTML 实体
                        }
                    }
                    // 如果仍然不是 HTTP URL，使用原始值
                    if (!/^https?:/.test(url || '')) {
                        url = data.url || data.file;
                    }
                    return {
                        type: 'video',
                        data: {
                            url,
                            file: url,
                        },
                    };
                }

            case 'record':
                return {
                    type: 'audio',
                    data: {
                        url: data.url || data.file,
                        file: data.file,
                    },
                };

            case 'location':
                return {
                    type: 'location',
                    data: {
                        latitude: Number(data.lat ?? data.latitude ?? 0),
                        longitude: Number(data.lng ?? data.longitude ?? 0),
                        title: data.title,
                        address: data.address,
                    },
                };

            case 'share':
                return {
                    type: 'text',
                    data: {
                        text: data.url || data.file || rawMessage || '[分享]',
                    },
                };

            case 'poke':
                return {
                    type: 'text',
                    data: {
                        text: `[戳一戳] ${data.name || ''}`.trim(),
                    },
                };

            case 'flash':
                return {
                    type: 'image',
                    data: {
                        url: data.url || data.file,
                        file: data.file,
                        isSpoiler: true,
                    },
                };

            case 'file':
                return {
                    type: 'file',
                    data: {
                        url: data.url,
                        filename: data.file || data.name,
                        size: data.file_size ? Number(data.file_size) : undefined,
                    },
                };

            case 'at':
                return {
                    type: 'at',
                    data: {
                        userId: String(data.qq),
                        userName: data.name || '',
                    },
                };

            case 'face':
                {
                    const faceTextRaw = (data.raw?.faceText || '').toString();
                    const isDiceFace = /骰/.test(faceTextRaw);
                    const isRpsFace = /猜拳|石头|剪刀|布|✊|✌|✋/.test(faceTextRaw);

                    if (isDiceFace) {
                        return {
                            type: 'dice',
                            data: {
                                emoji: '🎲',
                            },
                        };
                    }
                    if (isRpsFace) {
                        return {
                            type: 'dice',
                            data: {
                                emoji: '✊✋✌️',
                            },
                        };
                    }

                    const faceId = Number(data.id);
                    const faceKey = faceId.toString() as keyof typeof qface;
                    const faceText = typeof data.raw?.faceText === 'string'
                        ? data.raw.faceText
                        : qface[faceKey];
                    return {
                        type: 'face',
                        data: {
                            id: faceId,
                            text: faceText,
                        },
                    };
                }

            case 'forward':
                // 转发消息需要特殊处理
                return {
                    type: 'forward',
                    data: {
                        id: data.id, // Preserve ResID
                        messages: data.content
                            ? data.content.map((msg: any) => this.fromNapCat(msg))
                            : [],
                    },
                };

            case 'reply':
                return {
                    type: 'reply',
                    data: {
                        messageId: String(data.id),
                        senderId: '',
                        senderName: '',
                    },
                };

            case 'markdown':
                return {
                    type: 'text',
                    data: {
                        text: data.text || data.content || JSON.stringify(segment.data),
                    },
                };

            case 'json': {
                const converted = this.convertJsonCard(data);
                if (converted) {
                    return converted;
                }
                const fallback = typeof data.data === 'string' ? data.data : JSON.stringify(segment.data);
                return {
                    type: 'text',
                    data: {
                        text: this.truncateText(fallback),
                    },
                };
            }

            case 'mface':
                // 商城表情，转换为图片
                return {
                    type: 'sticker',
                    data: {
                        url: data.url,
                        isAnimated: true,
                    },
                };

            case 'dice':
                return {
                    type: 'dice',
                    data: {
                        emoji: '🎲',
                        value: Number(segment.data.result),
                    },
                };

            case 'rps':
                // 猜拳：仍走骰子通道，使用手势表情
                return {
                    type: 'dice',
                    data: {
                        emoji: '✊✋✌️',
                        value: Number(segment.data.result),
                    },
                };

            default:
                this.logger.warn({ type }, 'Unknown NapCat segment type:');
                return null;
        }
    }

    /**
     * 将 NapCat 的 JSON 卡片转换为简短的可读内容，避免在 TG 刷屏
     */
    private convertJsonCard(data: any): MessageContent[] | null {
        const parsed = this.parseJsonData(data?.data);
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }

        const locationMeta =
            parsed.meta?.['Location.Search'] ||
            parsed.meta?.Location?.Search ||
            parsed.meta?.location?.search ||
            parsed.meta?.location;

        const miniapp = parsed.meta?.miniapp || parsed.meta?.mini_app;
        const detail =
            parsed.meta?.detail_1 ||
            parsed.meta?.news ||
            parsed.meta?.detail ||
            parsed.meta?.card ||
            parsed.meta?.music ||
            parsed.meta?.video ||
            parsed.meta?.image;

        const prompt = (parsed.prompt || '').trim();
        const appName = (miniapp?.title || detail?.title || parsed.app || '').trim();
        const source = (miniapp?.source || detail?.source || '').trim();
        const desc = (detail?.desc || prompt || '').trim();
        const url = this.normalizeUrl(
            miniapp?.jumpUrl ||
            miniapp?.pcJumpUrl ||
            detail?.qqdocurl ||
            detail?.jumpUrl ||
            detail?.url
        );
        const preview = this.normalizeUrl(
            miniapp?.preview ||
            miniapp?.sourcelogo ||
            detail?.preview ||
            detail?.image ||
            detail?.picurl ||
            detail?.icon
        );

        const lines: string[] = [];
        lines.push(appName ? `[QQ小程序] ${appName}` : '[QQ小程序]');
        if (source) {
            lines.push(`来源：${source}`);
        }
        if (desc) {
            lines.push(desc);
        }
        if (url) {
            lines.push(url);
        }

        const text = lines.filter(Boolean).join('\n').trim();
        if (!text) {
            return null;
        }

        const contents: MessageContent[] = [];

        // 如果是位置卡片，优先输出 location 类型
        if (locationMeta) {
            const lat = Number(locationMeta.lat ?? locationMeta.latitude);
            const lng = Number(locationMeta.lng ?? locationMeta.longitude ?? locationMeta.lon);
            const name = (locationMeta.name || locationMeta.title || appName || '').trim();
            const address = (locationMeta.address || desc || '').trim();
            if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
                contents.push({
                    type: 'location',
                    data: {
                        latitude: lat,
                        longitude: lng,
                        title: name || undefined,
                        address: address || undefined,
                    },
                });
            }
        }

        // 对于位置卡片，避免重复输出小程序占位文本
        if (!locationMeta) {
            contents.push({
                type: 'text',
                data: { text: this.truncateText(text) },
            });
        }

        if (preview) {
            contents.push({
                type: 'image',
                data: {
                    url: preview,
                },
            });
        }

        return contents;
    }

    private parseJsonData(data: any): any | null {
        if (!data) return null;
        if (typeof data === 'object') return data;
        if (typeof data !== 'string') return null;

        try {
            return JSON.parse(data);
        } catch (error) {
            this.logger.warn('Failed to parse NapCat json segment', error);
            return null;
        }
    }

    private normalizeUrl(url?: string): string | undefined {
        if (!url || typeof url !== 'string') return undefined;
        let normalized = url.trim();
        if (!normalized) return undefined;

        if (normalized.startsWith('//')) {
            normalized = `https:${normalized}`;
        } else if (!/^https?:\/\//.test(normalized)) {
            if (normalized.startsWith('m.q.qq.com') || normalized.startsWith('qq.ugcimg.cn') || normalized.startsWith('b23.tv')) {
                normalized = `https://${normalized}`;
            } else {
                return undefined;
            }
        }

        return normalized;
    }

    private truncateText(text: string, maxLength = 500): string {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return `${text.slice(0, maxLength - 3)}...`;
    }
}
