import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Pencil, Trash2, Power, PowerOff } from 'lucide-react';
import { useAuth } from '@/lib/auth';

interface QqBot {
    id: number;
    uin: string | null;
    type: 'oicq' | 'napcat';
    wsUrl: string | null;
}

interface Instance {
    id: number;
    owner: string;
    workMode: string;
    isSetup: boolean;
    qqBot: QqBot | null;
    pairCount: number;
}

export function InstanceManagement() {
    const { token } = useAuth();
    const [instances, setInstances] = useState<Instance[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchInstances();
    }, [token]);

    const fetchInstances = async () => {
        try {
            const response = await fetch('/api/admin/instances', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setInstances(data.items || []);
            }
        } catch (error) {
            console.error('Failed to fetch instances:', error);
        } finally {
            setLoading(false);
        }
    };

    const deleteInstance = async (id: number) => {
        if (!confirm('确定要删除此实例吗？这将同时删除关联的所有配对。')) return;

        try {
            const response = await fetch(`/api/admin/instances/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                setInstances(instances.filter(i => i.id !== id));
            }
        } catch (error) {
            console.error('Failed to delete instance:', error);
        }
    };

    const getStatusBadge = (instance: Instance) => {
        if (!instance.qqBot) {
            return (
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                    未配置
                </span>
            );
        }

        // TODO: 实际需要获取运行时状态
        const isOnline = instance.isSetup;

        return (
            <span className={`px-2 py-1 text-xs font-medium rounded-full flex items-center ${isOnline
                    ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                    : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                }`}>
                {isOnline ? (
                    <>
                        <Power className="h-3 w-3 mr-1" />
                        在线
                    </>
                ) : (
                    <>
                        <PowerOff className="h-3 w-3 mr-1" />
                        离线
                    </>
                )}
            </span>
        );
    };

    if (loading) {
        return <div className="p-6">加载中...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">实例管理</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-2">
                        管理 NapGram 实例和 QQ Bot 配置
                    </p>
                </div>
                <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    添加实例
                </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {instances.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-gray-500 dark:text-gray-400">
                        暂无实例
                    </div>
                ) : (
                    instances.map((instance) => (
                        <Card key={instance.id} className="p-6">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                        实例 #{instance.id}
                                    </h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                        Owner: {instance.owner}
                                    </p>
                                </div>
                                {getStatusBadge(instance)}
                            </div>

                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">工作模式:</span>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {instance.workMode || '未设置'}
                                    </span>
                                </div>

                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">QQ Bot:</span>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {instance.qqBot ? (
                                            <span className="flex items-center">
                                                {instance.qqBot.type === 'napcat' ? 'NapCat' : 'OICQ'}
                                                {instance.qqBot.uin && (
                                                    <span className="ml-1 text-xs text-gray-500">
                                                        ({instance.qqBot.uin})
                                                    </span>
                                                )}
                                            </span>
                                        ) : (
                                            '未配置'
                                        )}
                                    </span>
                                </div>

                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">配对数量:</span>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {instance.pairCount}
                                    </span>
                                </div>

                                {instance.qqBot?.wsUrl && (
                                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                            WS: {instance.qqBot.wsUrl}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-2 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                                <Button variant="outline" size="sm" className="flex-1">
                                    <Pencil className="h-4 w-4 mr-2" />
                                    编辑
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => deleteInstance(instance.id)}
                                    className="text-red-600 hover:text-red-700 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
