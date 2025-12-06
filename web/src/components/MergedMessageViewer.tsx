import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Message {
    message: any[]; // NapCat message segments
    time?: number;
    // legacy fields from QQ forward history
    user_id?: number | string;
    sender_id?: number | string;
    nickname?: string;
    card?: string;
    avatar?: string;
    sender?: {
        id?: number | string;
        name?: string;
    };
}

interface MergedMessageViewerProps {
    uuid: string;
}

// 根据用户ID生成一致的渐变颜色（用于头像背景）
function getUserColor(userId: string | number): { gradient: string; badge: string; badgeText: string } {
    const colorSchemes = [
        { gradient: 'bg-gradient-to-br from-blue-400 to-blue-600', badge: 'bg-gradient-to-r from-blue-500 to-blue-600', badgeText: 'text-white' },
        { gradient: 'bg-gradient-to-br from-purple-400 to-purple-600', badge: 'bg-gradient-to-r from-purple-500 to-purple-600', badgeText: 'text-white' },
        { gradient: 'bg-gradient-to-br from-pink-400 to-pink-600', badge: 'bg-gradient-to-r from-pink-500 to-pink-600', badgeText: 'text-white' },
        { gradient: 'bg-gradient-to-br from-rose-400 to-rose-600', badge: 'bg-gradient-to-r from-rose-500 to-rose-600', badgeText: 'text-white' },
        { gradient: 'bg-gradient-to-br from-orange-400 to-orange-600', badge: 'bg-gradient-to-r from-orange-500 to-orange-600', badgeText: 'text-white' },
        { gradient: 'bg-gradient-to-br from-amber-400 to-amber-600', badge: 'bg-gradient-to-r from-amber-500 to-amber-600', badgeText: 'text-white' },
        { gradient: 'bg-gradient-to-br from-lime-400 to-lime-600', badge: 'bg-gradient-to-r from-lime-500 to-lime-600', badgeText: 'text-white' },
        { gradient: 'bg-gradient-to-br from-emerald-400 to-emerald-600', badge: 'bg-gradient-to-r from-emerald-500 to-emerald-600', badgeText: 'text-white' },
        { gradient: 'bg-gradient-to-br from-teal-400 to-teal-600', badge: 'bg-gradient-to-r from-teal-500 to-teal-600', badgeText: 'text-white' },
        { gradient: 'bg-gradient-to-br from-cyan-400 to-cyan-600', badge: 'bg-gradient-to-r from-cyan-500 to-cyan-600', badgeText: 'text-white' },
        { gradient: 'bg-gradient-to-br from-indigo-400 to-indigo-600', badge: 'bg-gradient-to-r from-indigo-500 to-indigo-600', badgeText: 'text-white' },
        { gradient: 'bg-gradient-to-br from-violet-400 to-violet-600', badge: 'bg-gradient-to-r from-violet-500 to-violet-600', badgeText: 'text-white' },
    ];
    const hash = String(userId).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colorSchemes[hash % colorSchemes.length];
}

export function MergedMessageViewer({ uuid }: MergedMessageViewerProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`/api/messages/merged/${uuid}`)
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch messages');
                return res.json();
            })
            .then(data => {
                setMessages(data);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, [uuid]);

    if (loading) return <div className="p-4 text-center text-slate-600">加载中...</div>;
    if (error) return <div className="p-4 text-center text-red-500">错误: {error}</div>;

    return (
        <div className="w-full min-h-screen bg-gradient-to-br from-slate-100 via-blue-50/30 to-slate-50 flex justify-center py-6 px-3">
            <div className="w-full max-w-4xl">
                <Card className="shadow-xl border-slate-200/60 bg-white/95 backdrop-blur-sm">
                    <CardHeader className="pb-3 border-b border-slate-100">
                        <CardTitle className="text-xl font-bold text-slate-800">聊天记录</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <ScrollArea className="h-[82vh] pr-3">
                            <div className="space-y-3">
                                {messages.map((msg, idx) => (
                                    <MessageBubble key={idx} msg={msg} idx={idx} />
                                ))}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function MessageBubble({ msg, idx }: { msg: Message; idx: number }) {
    const senderId = msg.user_id ?? msg.sender_id ?? msg.sender?.id ?? `user${idx}`;
    const name = msg.nickname || msg.card || msg.sender?.name || `未知用户`;
    const avatar = msg.avatar || (senderId && senderId !== `user${idx}` ? `/api/avatar/qq/${senderId}` : undefined);

    // 完整日期时间格式：YYYY/MM/DD HH:mm:ss
    const timeStr = msg.time ? new Date(msg.time * 1000).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).replace(/\//g, '/') : '';

    const userColors = getUserColor(senderId);

    return (
        <div className="flex items-start gap-2.5 group">
            {/* 头像 - 增大尺寸，添加渐变背景 */}
            <Avatar className="h-12 w-12 shadow-md border-2 border-white ring-2 ring-slate-200/60 flex-shrink-0 transition-transform hover:scale-105">
                <AvatarImage
                    src={avatar}
                    alt={name}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                        // 头像加载失败时使用 fallback
                        e.currentTarget.style.display = 'none';
                    }}
                />
                <AvatarFallback className={`${userColors.gradient} text-white font-bold text-base shadow-inner`}>
                    {name[0] || '?'}
                </AvatarFallback>
            </Avatar>

            {/* 消息内容区域 */}
            <div className="flex-1 min-w-0">
                {/* 用户信息栏 - 昵称 + 时间戳 */}
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-bold ${userColors.badge} ${userColors.badgeText} shadow-sm`}>
                        {name}
                    </span>
                    {timeStr && (
                        <span className="text-xs text-slate-500 font-medium">
                            {timeStr}
                        </span>
                    )}
                </div>

                {/* 消息气泡 - QQ/TG风格圆角，渐变背景，阴影 */}
                <div className="relative max-w-[85%]">
                    <div className="bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/60 border border-slate-200/80 shadow-sm rounded-[18px] rounded-tl-[6px] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words transition-all duration-200 hover:shadow-md hover:border-slate-300/90 backdrop-blur-sm">
                        {renderMessageContent(msg.message || [])}
                    </div>
                </div>
            </div>
        </div>
    );
}

function renderMessageContent(segments: any[]) {
    if (!Array.isArray(segments)) return null;
    return segments.map((seg, i) => {
        const type = seg?.type || seg?.data?.type;
        const data = seg?.data || seg || {};
        if (type === 'text') {
            const text = data.text ?? seg?.text ?? '';
            return (
                <div key={i} className="space-y-0.5">
                    {String(text)
                        .split(/\n/)
                        .map((line: string, idx2: number) => (
                            <p key={idx2} className="m-0">{line || '\u00A0'}</p>
                        ))}
                </div>
            );
        }
        if (type === 'image' || type === 'flash' || type === 'bface') {
            const url = data.url || data.file || seg?.url || seg?.file;
            if (url) {
                return (
                    <div key={i} className="my-2">
                        <img src={url} alt="Image" className="max-w-full rounded-md shadow border border-slate-200" />
                    </div>
                );
            }
            return <span key={i}>[image]</span>;
        }
        if (type === 'video' || type === 'video-loop') {
            const url = data.url || data.file || seg?.url || seg?.file;
            return (
                <div key={i} className="my-1 text-sky-700 underline break-all">
                    [video] {url && <a href={url} target="_blank" rel="noreferrer">{url}</a>}
                </div>
            );
        }
        if (type === 'record') {
            const url = data.url || data.file || seg?.url || seg?.file;
            return (
                <div key={i} className="my-1 text-sky-700 underline break-all">
                    [语音] {url && <a href={url} target="_blank" rel="noreferrer">{url}</a>}
                </div>
            );
        }
        if (type === 'face' || type === 'sface' || type === 'at') {
            const id = data.id || data.text || '';
            return <span key={i}>[{type}: {id}]</span>;
        }
        // Fallback
        return <span key={i}>[{type || 'unknown'}]</span>;
    });
}
