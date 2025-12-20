/**
 * NapGram Plugin Types
 * 
 * TypeScript type definitions for NapGram native plugins
 * 
 * @packageDocumentation
 */

// Re-export all types from NapGram core
export type {
    // Plugin
    NapGramPlugin,
    PluginSpec,
    PluginPermissions,

    // Context
    PluginContext,

    // Events
    BaseEvent,
    MessageEvent,
    FriendRequestEvent,
    GroupRequestEvent,
    FriendIncreaseEvent,
    FriendDecreaseEvent,
    GroupIncreaseEvent,
    GroupDecreaseEvent,
    GroupAdminChangeEvent,
    GroupMuteEvent,

    // Message Segments
    MessageSegment,
    TextSegment,
    AtSegment,
    ReplySegment,
    ImageSegment,
    VideoSegment,
    AudioSegment,
    FileSegment,
    FaceSegment,

    // APIs
    MessageAPI,
    SendMessageParams,
    SendMessageResult,
    RecallMessageParams,
    GetMessageParams,
    MessageInfo,

    InstanceAPI,
    InstanceInfo,
    InstanceStatus,

    UserAPI,
    GetUserParams,
    UserInfo,

    GroupAPI,
    GetGroupParams,
    GroupInfo,
    GroupMember,
    SetAdminParams,
    MuteUserParams,
    KickUserParams,

    PluginStorage,
    PluginLogger,
} from '../../../main/src/plugins/core/interfaces';

// Version
export const VERSION = '0.1.0';
