/**
 * 交互式状态管理器（用于多步骤命令）
 */
export class InteractiveStateManager {
    // Key: `${chatId}:${userId}`
    bindingStates = new Map();
    TIMEOUT_MS = 5 * 60 * 1000; // 5分钟超时
    /**
     * 设置绑定状态
     */
    setBindingState(chatId, userId, threadId) {
        const key = `${chatId}:${userId}`;
        this.bindingStates.set(key, {
            threadId,
            userId,
            timestamp: Date.now(),
        });
    }
    /**
     * 获取绑定状态
     */
    getBindingState(chatId, userId) {
        const key = `${chatId}:${userId}`;
        return this.bindingStates.get(key);
    }
    /**
     * 删除绑定状态
     */
    deleteBindingState(chatId, userId) {
        const key = `${chatId}:${userId}`;
        this.bindingStates.delete(key);
    }
    /**
     * 检查状态是否超时
     */
    isTimeout(state) {
        return Date.now() - state.timestamp > this.TIMEOUT_MS;
    }
    /**
     * 清理所有过期状态
     */
    cleanupExpired() {
        const now = Date.now();
        for (const [key, state] of this.bindingStates.entries()) {
            if (now - state.timestamp > this.TIMEOUT_MS) {
                this.bindingStates.delete(key);
            }
        }
    }
}
