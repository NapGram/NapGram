/**
 * 递归将对象中的所有 BigInt 转换为字符串，以便于 JSON 序列化
 */
export function stringifyBigInts(obj: any): any {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (typeof obj === 'bigint') {
        return obj.toString();
    }

    if (Array.isArray(obj)) {
        return obj.map(item => stringifyBigInts(item));
    }

    if (typeof obj === 'object' && !(obj instanceof Date)) {
        const result: Record<string, any> = {};
        for (const key of Object.keys(obj)) {
            result[key] = stringifyBigInts(obj[key]);
        }
        return result;
    }

    return obj;
}
