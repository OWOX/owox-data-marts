import { jest } from '@jest/globals';

// Mock the logger to prevent console output during tests
jest.unstable_mockModule('@owox/internal-helpers', () => ({
  LoggerFactory: {
    createNamedLogger: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
      log: jest.fn(),
    }),
  },
}));
