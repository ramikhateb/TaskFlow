// Shared contracts (Zod schemas, DTO types) used by both apps/api and
// apps/mobile, so request/response shapes can't drift between them.

export const SHARED_PACKAGE_ID = "@taskflow/shared" as const;

export * from "./schemas/auth";
export * from "./schemas/task";
export * from "./schemas/user";
