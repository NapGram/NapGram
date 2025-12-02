-- Add tgThreadId column to ForwardPair table
ALTER TABLE "ForwardPair" ADD COLUMN "tgThreadId" INTEGER;

-- Drop old unique constraint
ALTER TABLE "ForwardPair" DROP CONSTRAINT "ForwardPair_tgChatId_instanceId_key";

-- Add new unique constraint including tgThreadId
ALTER TABLE "ForwardPair" ADD CONSTRAINT "ForwardPair_tgChatId_tgThreadId_instanceId_key" UNIQUE ("tgChatId", "tgThreadId", "instanceId");
