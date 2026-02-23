import { jest } from '@jest/globals';

// Mock the logger to prevent console output during tests
jest.unstable_mockModule('./src/core/logger.js', () => ({
  createServiceLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  }),
}));
