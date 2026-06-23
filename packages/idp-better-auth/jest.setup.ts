import { jest } from '@jest/globals';

// Mock the logger to prevent console output during tests
jest.unstable_mockModule('@owox/internal-helpers', () => ({
  disableConditionalCaching: jest.fn(),
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
  // disableConditionalCaching is imported by @owox/idp-protocol's protocol-middleware
  // and must be present in the mock so Jest ESM can satisfy the named import binding
  disableConditionalCaching: jest.fn(),
  sendSecureHtml: jest.fn(),
  // LogLevel is imported by auth-config.ts / page-service.ts; provide an
  // enum-like object so the named import binding resolves under Jest ESM.
  LogLevel: { ERROR: 'error', WARN: 'warn', INFO: 'info', DEBUG: 'debug' },
}));
