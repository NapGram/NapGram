-- QQ 官方机器人（QQ 开放平台 / 频道消息）支持
-- 1) QqBot 类型枚举扩展：napcat（个人号协议） -> 新增 qqofficial
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'qqofficial'
      AND enumtypid = '"public"."QqBotType"'::regtype
  ) THEN
    ALTER TYPE "public"."QqBotType" ADD VALUE 'qqofficial';
  END IF;
END
$$;

-- 2) QqBot 表新增 NapCat WS token 与官方机器人凭据列
ALTER TABLE "QqBot" ADD COLUMN IF NOT EXISTS "wsToken" text;
ALTER TABLE "QqBot" ADD COLUMN IF NOT EXISTS "officialAppId" text;
ALTER TABLE "QqBot" ADD COLUMN IF NOT EXISTS "officialAppSecret" text;
