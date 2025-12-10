import { Link, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Link as LinkIcon,
    Server,
    MessageSquare,
    BarChart3,
    Settings,
    FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navigation = [
    { name: '仪表板', href: '/ui/admin', icon: LayoutDashboard },
    { name: '配对管理', href: '/ui/admin/pairs', icon: LinkIcon },
    { name: '实例管理', href: '/ui/admin/instances', icon: Server },
    { name: '消息记录', href: '/ui/admin/messages', icon: MessageSquare },
    { name: '统计分析', href: '/ui/admin/statistics', icon: BarChart3 },
    { name: '系统日志', href: '/ui/admin/logs', icon: FileText },
    { name: '系统设置', href: '/ui/admin/settings', icon: Settings },
];

export function Sidebar() {
    const location = useLocation();

    return (
        <div className="hidden md:flex md:w-64 md:flex-col">
            <div className="flex flex-col flex-grow border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto">
                <div className="flex items-center flex-shrink-0 px-4 py-5 border-b border-gray-200 dark:border-gray-700">
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                        NapGram 管理面板
                    </h1>
                </div>
                <nav className="flex-1 px-2 py-4 space-y-1">
                    {navigation.map((item) => {
                        const isActive = location.pathname === item.href ||
                            (item.href !== '/ui/admin' && location.pathname.startsWith(item.href));
                        const Icon = item.icon;

                        return (
                            <Link
                                key={item.name}
                                to={item.href}
                                className={cn(
                                    'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                                    isActive
                                        ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                )}
                            >
                                <Icon
                                    className={cn(
                                        'mr-3 h-5 w-5 flex-shrink-0',
                                        isActive
                                            ? 'text-blue-600 dark:text-blue-400'
                                            : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300'
                                    )}
                                />
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}
