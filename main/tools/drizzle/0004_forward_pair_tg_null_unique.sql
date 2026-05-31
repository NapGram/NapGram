DELETE FROM "ForwardPair" a
USING "ForwardPair" b
WHERE a."id" > b."id"
  AND a."instanceId" = b."instanceId"
  AND a."tgChatId" = b."tgChatId"
  AND a."tgThreadId" IS NULL
  AND b."tgThreadId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "ForwardPair_tgChatId_instanceId_nullThread_key"
  ON "ForwardPair" USING btree ("tgChatId", "instanceId")
  WHERE "tgThreadId" IS NULL;
