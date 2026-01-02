interface BindingState {
    threadId?: number;
    userId: string;
    timestamp: number;
}
/**
 * 交互式状态管理器（用于多步骤命令）
 */
export declare class InteractiveStateManager {
    private bindingStates;
    private readonly TIMEOUT_MS;
    /**
     * 设置绑定状态
     */
    setBindingState(chatId: string, userId: string, threadId?: number): void;
    /**
     * 获取绑定状态
     */
    getBindingState(chatId: string, userId: string): BindingState | undefined;
    /**
     * 删除绑定状态
     */
    deleteBindingState(chatId: string, userId: string): void;
    /**
     * 检查状态是否超时
     */
    isTimeout(state: BindingState): boolean;
    /**
     * 清理所有过期状态
     */
    cleanupExpired(): void;
}
export {};
