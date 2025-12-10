import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link2, Server, MessageSquare, Activity } from 'lucide-react';

interface Stats {
    pairsCount: number;
    instancesCount: number;
    messagesCount: number;
    status: 'healthy' | 'degraded' | 'unhealthy';
}

export function Dashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // TODO: Fetch real stats from API
        // For now, using mock data
        setTimeout(() => {
            setStats({
                pairsCount: 8,
                instancesCount: 2,
                messagesCount: 12547,
                status: 'healthy'
            });
            setLoading(false);
        }, 500);
    }, []);

    if (loading) {
        return <div>加载中...</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">仪表板</h1>
                <p className="text-gray-600 darktext-gray 400 mt-2">
                    系统概览和关键指标
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            转发配对
                        </CardTitle>
                        <Link2 className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.pairsCount || 0}</div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            活跃的 QQ-TG 配对
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            实例数量
                        </CardTitle>
                        <Server className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.instancesCount || 0}</div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            运行中的实例
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            消息总数
                        </CardTitle>
                        <MessageSquare className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {stats?.messagesCount?.toLocaleString() || 0}
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            已转发消息
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            系统状态
                        </CardTitle>
                        <Activity className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center space-x-2">
                            <div className={`h-3 w-3 rounded-full ${stats?.status === 'healthy' ? 'bg-green-500' :
                                    stats?.status === 'degraded' ? 'bg-yellow-500' :
                                        'bg-red-500'
                                }`} />
                            <span className="text-sm font-medium capitalize">
                                {stats?.status === 'healthy' ? '正常' :
                                    stats?.status === 'degraded' ? '降级' : '异常'}
                            </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            所有服务运行正常
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>快速操作</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                    <a
                        href="/ui/admin/pairs"
                        className="flex items-center p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        <Link2 className="h-5 w-5 mr-3 text-blue-600" />
                        <div>
                            <h3 className="font-medium">管理配对</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                添加或编辑 QQ-TG 转发配对
                            </p>
                        </div>
                    </a>
                    <a
                        href="/ui/admin/messages"
                        className="flex items-center p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        <MessageSquare className="h-5 w-5 mr-3 text-blue-600" />
                        <div>
                            <h3 className="font-medium">查看消息</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                浏览转发消息记录
                            </p>
                        </div>
                    </a>
                </CardContent>
            </Card>
        </div>
    );
}
