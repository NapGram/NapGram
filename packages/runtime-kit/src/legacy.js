export { env, db } from '@napgram/infra-kit';
import { InstanceRegistry } from './runtime-holder';
export const Instance = {
    get instances() {
        return InstanceRegistry.getAll();
    }
};
export { sentry } from '@napgram/infra-kit';
export { getLogger } from '@napgram/infra-kit';
export { ApiResponse } from '@napgram/infra-kit';
export { ErrorResponses, registerDualRoute } from '@napgram/infra-kit';
export { getMimeType } from '@napgram/infra-kit';
import { temp } from '@napgram/infra-kit';
export const { TEMP_PATH } = temp;
export { TTLCache } from '@napgram/infra-kit';
export { convert } from '@napgram/media-kit';
export { convert as default } from '@napgram/media-kit';
export { formatDate } from '@napgram/infra-kit';
export { groupInfoCache } from '@napgram/infra-kit';
// 通用工具函数
export { hashing as hashingUtils, DurationParser } from '@napgram/infra-kit';
// Re-export new runtime types for compatibility
export * from './runtime-types';
export { getGlobalRuntime, tryGetGlobalRuntime } from './runtime-holder';
