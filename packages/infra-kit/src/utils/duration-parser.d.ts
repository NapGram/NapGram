/**
 * 时长解析工具类
 */
export declare class DurationParser {
    /**
     * 解析人性化时长字符串为秒数
     * 支持格式: 1m, 30m, 1h, 2h, 1d
     * @param duration 时长字符串
     * @returns 秒数
     * @throws Error 如果格式无效
     */
    static parse(duration: string): number;
    /**
     * 将秒数格式化为人类可读的字符串
     * @param seconds 秒数
     * @returns 格式化的字符串
     */
    static format(seconds: number): string;
    /**
     * 获取默认禁言时长（30分钟）
     */
    static get DEFAULT_BAN_DURATION(): number;
    /**
     * 获取最大禁言时长（30天）
     */
    static get MAX_BAN_DURATION(): number;
}
