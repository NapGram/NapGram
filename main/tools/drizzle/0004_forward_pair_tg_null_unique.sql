DO $$
DECLARE
  conflicts text;
BEGIN
  SELECT string_agg(format('instanceId=%s, tgChatId=%s, pairIds=[%s]',
    "instanceId", "tgChatId", pair_ids), '; ' ORDER BY "instanceId", "tgChatId")
  INTO conflicts
  FROM (
    SELECT "instanceId", "tgChatId", string_agg("id"::text, ', ' ORDER BY "id") AS pair_ids
    FROM "ForwardPair"
    WHERE "tgThreadId" IS NULL
    GROUP BY "instanceId", "tgChatId"
    HAVING count(*) > 1
  ) duplicates;

  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot apply migration 0004: conflicting Telegram targets. %', conflicts
      USING HINT = 'Resolve conflicting ForwardPair bindings by assigning distinct Telegram chats or threads, then rerun migrations. All bindings and dependent records are preserved.';
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ForwardPair_tgChatId_instanceId_nullThread_key"
  ON "ForwardPair" USING btree ("tgChatId", "instanceId")
  WHERE "tgThreadId" IS NULL;
