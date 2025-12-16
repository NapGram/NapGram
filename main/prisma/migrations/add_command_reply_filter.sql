-- AlterTable
ALTER TABLE "ForwardPair" 
ADD COLUMN "commandReplyMode" TEXT,
ADD COLUMN "commandReplyFilter" TEXT,
ADD COLUMN "commandReplyList" TEXT;

-- Add comments
COMMENT ON COLUMN "ForwardPair"."commandReplyMode" IS '命令回复模式: "0"=仅回复发起平台, "1"=双向回复 (null=使用环境变量默认值)';
COMMENT ON COLUMN "ForwardPair"."commandReplyFilter" IS '命令回复过滤模式: "whitelist"=白名单, "blacklist"=黑名单, null=不过滤';
COMMENT ON COLUMN "ForwardPair"."commandReplyList" IS '命令列表(逗号分隔): "help,status,info" 配合 commandReplyFilter 使用';
