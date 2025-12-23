ALTER TABLE "public"."ForwardPair"
  ADD COLUMN "notifyTelegram" boolean NOT NULL DEFAULT false,
  ADD COLUMN "notifyQQ" boolean NOT NULL DEFAULT false;
