CREATE TABLE "slave_market"."slave_market_stock_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"scopeId" text,
	"symbol" text NOT NULL,
	"market" text,
	"side" text NOT NULL,
	"quantity" integer NOT NULL,
	"price" double precision NOT NULL,
	"fee" integer DEFAULT 0 NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'success',
	"createdAt" bigint NOT NULL,
	"dateKey" bigint,
	"extra" json
);
--> statement-breakpoint
CREATE TABLE "slave_market"."slave_market_stocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"scopeId" text,
	"symbol" text NOT NULL,
	"market" text,
	"quantity" integer DEFAULT 0 NOT NULL,
	"avgCost" double precision DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD',
	"lastPrice" double precision DEFAULT 0,
	"lastUpdate" bigint,
	"lastTradeTime" bigint
);
--> statement-breakpoint
CREATE TABLE "slave_market"."slave_market_stock_quotes" (
	"symbol" text PRIMARY KEY NOT NULL,
	"market" text,
	"price" double precision NOT NULL,
	"open" double precision,
	"high" double precision,
	"low" double precision,
	"prevClose" double precision,
	"ts" bigint NOT NULL,
	"scopeId" text,
	"source" text,
	"payload" json
);
--> statement-breakpoint
CREATE INDEX "slave_market_stock_orders_userId_dateKey_idx" ON "slave_market"."slave_market_stock_orders" USING btree ("userId","dateKey");--> statement-breakpoint
CREATE INDEX "slave_market_stocks_userId_symbol_idx" ON "slave_market"."slave_market_stocks" USING btree ("userId","symbol");--> statement-breakpoint
CREATE INDEX "slave_market_stock_quotes_ts_idx" ON "slave_market"."slave_market_stock_quotes" USING btree ("ts");