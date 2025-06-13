/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/cli/**/*.js', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  verbose: true,
  testTimeout: 30000,
  moduleDirectories: ['node_modules', 'src'],
  rootDir: '.',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
