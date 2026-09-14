import { PrismaClient } from "@prisma/client";

// Single shared client per process, per Prisma's recommended usage —
// repositories import this instead of constructing their own.
export const prisma = new PrismaClient();
