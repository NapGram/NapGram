-- QQ/TG 群命令触发策略（slash | mention | off），NULL 时回退环境变量 COMMAND_POLICY
ALTER TABLE "ForwardPair" ADD COLUMN IF NOT EXISTS "commandPolicy" text;
