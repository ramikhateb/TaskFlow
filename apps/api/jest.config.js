/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  setupFiles: ["<rootDir>/tests/setupEnv.ts"],
  clearMocks: true,
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
};
