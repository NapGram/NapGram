ALTER TABLE "ForwardPair" ADD COLUMN IF NOT EXISTS "qqChatType" text NOT NULL DEFAULT 'group';--> statement-breakpoint
ALTER TABLE "ForwardPair" ADD COLUMN IF NOT EXISTS "qqDisplayName" text;--> statement-breakpoint
ALTER TABLE "ForwardPair" ADD COLUMN IF NOT EXISTS "tgProvisionedByUserSessionId" integer;--> statement-breakpoint
ALTER TABLE "ForwardPair" ADD COLUMN IF NOT EXISTS "autoCreated" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "qqChatType" text NOT NULL DEFAULT 'group';--> statement-breakpoint
DO $$
DECLARE
  conflicts text;
BEGIN
  SELECT string_agg(format('instanceId=%s, qqRoomId=%s, pairIds=[%s]',
    "instanceId", normalized_id, pair_ids), '; ' ORDER BY "instanceId", normalized_id)
  INTO conflicts
  FROM (
    SELECT "instanceId", abs("qqRoomId") AS normalized_id,
      string_agg("id"::text, ', ' ORDER BY "id") AS pair_ids
    FROM "ForwardPair"
    WHERE "qqChatType" = 'group'
    GROUP BY "instanceId", abs("qqRoomId")
    HAVING count(*) > 1
  ) duplicates;

  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot apply migration 0003: conflicting signed QQ group IDs. %', conflicts
      USING HINT = 'Resolve conflicting ForwardPair bindings for each QQ group before normalizing IDs, then rerun migrations. All bindings and dependent records are preserved.';
  END IF;
END $$;--> statement-breakpoint
DROP INDEX IF EXISTS "ForwardPair_qqRoomId_instanceId_key";--> statement-breakpoint
UPDATE "ForwardPair" SET "qqRoomId" = -"qqRoomId" WHERE "qqChatType" = 'group' AND "qqRoomId" < 0;--> statement-breakpoint
UPDATE "Message" SET "qqRoomId" = -"qqRoomId" WHERE "qqChatType" = 'group' AND "qqRoomId" < 0;--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "ForwardPair"
    ADD CONSTRAINT "ForwardPair_tgProvisionedByUserSessionId_fkey"
    FOREIGN KEY ("tgProvisionedByUserSessionId") REFERENCES "Session"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ForwardPair_qqChatType_qqRoomId_instanceId_key" ON "ForwardPair" USING btree ("qqChatType","qqRoomId","instanceId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Message_qqChatType_qqRoomId_qqSenderId_seq_rand_pktnum_time_instanceId_idx" ON "Message" USING btree ("qqChatType","qqRoomId","qqSenderId","seq","rand","pktnum","time","instanceId");
