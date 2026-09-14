// Runs before the test framework loads. Values here match the docker-compose
// local dev credentials (not secrets) — see docker-compose.yml — pointed at
// the isolated taskflow_test database so integration tests never touch dev data.
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://taskflow:taskflow@localhost:5432/taskflow_test?schema=public";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? "test-only-secret-not-for-production-use-aaaa";
process.env.JWT_ACCESS_TTL_SECONDS = process.env.JWT_ACCESS_TTL_SECONDS ?? "900";
process.env.REFRESH_TOKEN_TTL_DAYS = process.env.REFRESH_TOKEN_TTL_DAYS ?? "30";
