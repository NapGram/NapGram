import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/lib/auth';
import { Loader2 } from 'lucide-react';

export function LoginPage() {
    const navigate = useNavigate();
    const { login } = useAuth();

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Token login state
    const [token, setToken] = useState('');

    // Username/password login state
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const handleTokenLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            const success = await login(token);
            if (success) {
                navigate('/ui/admin');
            } else {
                setError('Token 无效或已过期');
            }
        } catch (err) {
            setError('登录失败，请稍后重试');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePasswordLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            const success = await login(username, password);
            if (success) {
                navigate('/ui/admin');
            } else {
                setError('用户名或密码错误');
            }
        } catch (err) {
            setError('登录失败，请稍后重试');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold text-center">
                        NapGram 管理后台
                    </CardTitle>
                    <CardDescription className="text-center">
                        选择登录方式访问管理控制台
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="token" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="token">Token 登录</TabsTrigger>
                            <TabsTrigger value="password">密码登录</TabsTrigger>
                        </TabsList>

                        <TabsContent value="token">
                            <form onSubmit={handleTokenLogin} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="token">Access Token</Label>
                                    <Input
                                        id="token"
                                        type="password"
                                        placeholder="输入您的 Access Token"
                                        value={token}
                                        onChange={(e) => setToken(e.target.value)}
                                        disabled={isLoading}
                                        required
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        从环境变量 ADMIN_TOKEN 或管理员处获取
                                    </p>
                                </div>

                                {error && (
                                    <Alert variant="destructive">
                                        <AlertDescription>{error}</AlertDescription>
                                    </Alert>
                                )}

                                <Button type="submit" className="w-full" disabled={isLoading}>
                                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    登录
                                </Button>
                            </form>
                        </TabsContent>

                        <TabsContent value="password">
                            <form onSubmit={handlePasswordLogin} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="username">用户名</Label>
                                    <Input
                                        id="username"
                                        type="text"
                                        placeholder="输入用户名"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        disabled={isLoading}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="password">密码</Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="输入密码"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        disabled={isLoading}
                                        required
                                    />
                                </div>

                                {error && (
                                    <Alert variant="destructive">
                                        <AlertDescription>{error}</AlertDescription>
                                    </Alert>
                                )}

                                <Button type="submit" className="w-full" disabled={isLoading}>
                                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    登录
                                </Button>
                            </form>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
