/**
 * 通用API响应工具类
 * 用于统一Web API的响应格式
 */
export class ApiResponse {
    /**
     * 创建成功响应
     */
    static success(data, message) {
        const response = {
            success: true,
        };
        if (data !== undefined) {
            response.data = data;
        }
        if (message) {
            response.message = message;
        }
        return response;
    }
    /**
     * 创建错误响应
     */
    static error(message, error) {
        const response = {
            success: false,
            message,
        };
        if (error) {
            response.error = typeof error === 'string' ? error : (error?.message || String(error));
        }
        return response;
    }
    /**
     * 创建分页响应
     */
    static paginated(items, total, page, pageSize) {
        return {
            success: true,
            items,
            total,
            page,
            pageSize,
        };
    }
}
