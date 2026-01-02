/**
 * 通用API响应工具类
 * 用于统一Web API的响应格式
 */
export declare class ApiResponse {
    /**
     * 创建成功响应
     */
    static success<T = any>(data?: T, message?: string): any;
    /**
     * 创建错误响应
     */
    static error(message: string, error?: any): any;
    /**
     * 创建分页响应
     */
    static paginated<T = any>(items: T[], total: number, page: number, pageSize: number): {
        success: true;
        items: T[];
        total: number;
        page: number;
        pageSize: number;
    };
}
/**
 * API响应类型定义
 */
export interface ApiSuccessResponse<T = any> {
    success: true;
    data?: T;
    message?: string;
}
export interface ApiErrorResponse {
    success: false;
    message: string;
    error?: any;
    details?: any;
}
export interface ApiPaginatedResponse<T = any> {
    success: true;
    items: T[];
    total: number;
    page: number;
    pageSize: number;
}
export type ApiResult<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;
