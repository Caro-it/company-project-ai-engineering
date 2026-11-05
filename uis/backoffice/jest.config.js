// Jest para las utilidades de lib/ (AUTH-088). Los tests de Playwright viven en e2e/.
// En .js y no en .ts: así Jest no necesita ts-node para leer su propia configuración.
/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  testMatch: ["<rootDir>/__tests__/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/e2e/", "<rootDir>/.next/"],
  modulePathIgnorePatterns: ["<rootDir>/.next/"],
  // Mismo alias que tsconfig.json ("@/*" → "./*")
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  transform: {
    "^.+\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.jest.json" }],
  },
  collectCoverageFrom: ["lib/**/*.ts", "!lib/**/*.d.ts"],
};
