ALTER TABLE "ForwardPair" ADD COLUMN IF NOT EXISTS "qqChatType" text NOT NULL DEFAULT 'group';--> statement-breakpoint
ALTER TABLE "ForwardPair" ADD COLUMN IF NOT EXISTS "qqDisplayName" text;--> statement-breakpoint
ALTER TABLE "ForwardPair" ADD COLUMN IF NOT EXISTS "tgProvisionedByUserSessionId" integer;--> statement-breakpoint
ALTER TABLE "ForwardPair" ADD COLUMN IF NOT EXISTS "autoCreated" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "qqChatType" text NOT NULL DEFAULT 'group';--> statement-breakpoint
UPDATE "ForwardPair" SET "qqRoomId" = -"qqRoomId" WHERE "qqChatType" = 'group' AND "qqRoomId" < 0;--> statement-breakpoint
UPDATE "Message" SET "qqRoomId" = -"qqRoomId" WHERE "qqChatType" = 'group' AND "qqRoomId" < 0;--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "ForwardPair"
    ADD CONSTRAINT "ForwardPair_tgProvisionedByUserSessionId_fkey"
    FOREIGN KEY ("tgProvisionedByUserSessionId") REFERENCES "Session"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DROP INDEX IF EXISTS "ForwardPair_qqRoomId_instanceId_key";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ForwardPair_qqChatType_qqRoomId_instanceId_key" ON "ForwardPair" USING btree ("qqChatType","qqRoomId","instanceId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Message_qqChatType_qqRoomId_qqSenderId_seq_rand_pktnum_time_instanceId_idx" ON "Message" USING btree ("qqChatType","qqRoomId","qqSenderId","seq","rand","pktnum","time","instanceId");
