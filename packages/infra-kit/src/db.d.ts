import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
declare const db: PrismaClient<{
    adapter: PrismaPg;
}, never, import("@prisma/client/runtime/client").DefaultArgs>;
export default db;
