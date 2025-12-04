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

    if (loading) return <div className="p-4 text-center">Loading...</div>;
    if (error) return <div className="p-4 text-center text-red-500">Error: {error}</div>;

    return (
        <div className="w-full min-h-screen bg-slate-50 flex justify-center py-4 px-2">
            <div className="w-full max-w-4xl">
                <Card className="shadow-sm border-slate-200 bg-white/70 backdrop-blur">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg font-semibold text-slate-800">Chat History</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <ScrollArea className="h-[85vh] pr-2">
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
    const senderId = msg.user_id ?? msg.sender_id ?? msg.sender?.id ?? `#${idx}`;
    const name = msg.nickname || msg.card || msg.sender?.name || `Unknown`;
    const avatar = msg.avatar || (senderId ? `/api/avatar/qq/${senderId}` : undefined);
    const timeStr = msg.time ? new Date(msg.time * 1000).toLocaleString() : '';

    return (
        <div className="flex items-start gap-3">
            <Avatar className="h-10 w-10 shadow-sm border border-slate-200 bg-white">
                <AvatarImage src={avatar} />
                <AvatarFallback>{name[0] || '?'}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm text-slate-800">{name}</span>
                    <span className="text-xs text-slate-400">{timeStr}</span>
                </div>
                <div className="bg-slate-100 border border-slate-200 shadow-sm rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {renderMessageContent(msg.message || [])}
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
