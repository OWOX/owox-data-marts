import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { LegacyDataMartsService } from './legacy-data-marts.service';

// Mock external dependencies
jest.mock('@owox/internal-helpers', () => ({
  fetchWithBackoff: jest.fn(),
  ImpersonatedIdTokenFetcher: jest.fn().mockImplementation(() => ({
    getIdToken: jest.fn().mockResolvedValue('mock-id-token'),
  })),
}));

import { fetchWithBackoff } from '@owox/internal-helpers';
const mockFetchWithBackoff = fetchWithBackoff as jest.MockedFunction<typeof fetchWithBackoff>;

describe('LegacyDataMartsService', () => {
  let service: LegacyDataMartsService;
  let configService: jest.Mocked<ConfigService>;

  const mockConfig = {
    LEGACY_DATA_MARTS_ENDPOINT_BASE_URL: 'https://api.example.com',
    LEGACY_DATA_MARTS_ENDPOINT_AUTH_SERVICE_ACCOUNT: 'sa@example.com',
    LEGACY_DATA_MARTS_ENDPOINT_TARGET_AUDIENCE: 'https://api.example.com',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    configService = {
      get: jest
        .fn()
        .mockImplementation((key: string) => mockConfig[key as keyof typeof mockConfig]),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [LegacyDataMartsService, { provide: ConfigService, useValue: configService }],
    }).compile();

    service = module.get<LegacyDataMartsService>(LegacyDataMartsService);
  });

  describe('configuration', () => {
    it('should throw error when partially configured', async () => {
      const partialConfig = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'LEGACY_DATA_MARTS_ENDPOINT_BASE_URL') return 'https://api.example.com';
          return undefined;
        }),
      } as unknown as jest.Mocked<ConfigService>;

      await expect(
        Test.createTestingModule({
          providers: [LegacyDataMartsService, { provide: ConfigService, useValue: partialConfig }],
        }).compile()
      ).rejects.toThrow('Legacy ODM service is partially configured');
    });

    it('should allow empty configuration (not configured)', async () => {
      const emptyConfig = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as jest.Mocked<ConfigService>;

      const module = await Test.createTestingModule({
        providers: [LegacyDataMartsService, { provide: ConfigService, useValue: emptyConfig }],
      }).compile();

      const unconfiguredService = module.get<LegacyDataMartsService>(LegacyDataMartsService);

      await expect(unconfiguredService.getGcpProjectsList('test')).rejects.toThrow(
        'Legacy ODM service is not configured'
      );
    });
  });

  describe('isDataMartIdLooksLikeLegacy', () => {
    it('should return true for valid MD5-like hash', () => {
      expect(service.isDataMartIdLooksLikeLegacy('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')).toBe(true);
    });

    it('should return false for UUID format', () => {
      expect(service.isDataMartIdLooksLikeLegacy('a1b2c3d4-e5f6-a1b2-c3d4-e5f6a1b2c3d4')).toBe(
        false
      );
    });

    it('should return false for short strings', () => {
      expect(service.isDataMartIdLooksLikeLegacy('abc123')).toBe(false);
    });

    it('should return false for strings with uppercase', () => {
      expect(service.isDataMartIdLooksLikeLegacy('A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4')).toBe(false);
    });

    it('should return false for strings with non-hex characters', () => {
      expect(service.isDataMartIdLooksLikeLegacy('g1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')).toBe(false);
    });
  });

  describe('getGcpProjectsList', () => {
    it('should return list of GCP projects', async () => {
      const mockProjects = ['project-1', 'project-2'];
      mockFetchWithBackoff.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockProjects),
      } as unknown as Response);

      const result = await service.getGcpProjectsList('bi-project');

      expect(result).toEqual(mockProjects);
      expect(mockFetchWithBackoff).toHaveBeenCalledWith(
        'https://api.example.com/odm/bi-project/gcp',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-id-token',
          }),
        })
      );
    });
  });

  describe('getDataMartsList', () => {
    it('should return list of data mart IDs', async () => {
      const mockDataMarts = ['dm-1', 'dm-2'];
      mockFetchWithBackoff.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockDataMarts),
      } as unknown as Response);

      const result = await service.getDataMartsList('gcp-project');

      expect(result).toEqual(mockDataMarts);
      expect(mockFetchWithBackoff).toHaveBeenCalledWith(
        'https://api.example.com/odm/gcp/gcp-project/data-marts',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('getDataMartDetails', () => {
    it('should return data mart details', async () => {
      const mockDetails = {
        id: 'dm-123',
        title: 'Test Data Mart',
        description: 'Description',
        query: 'SELECT 1',
        gcpProjectId: 'gcp-project',
        projectId: 'project-id',
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      };
      mockFetchWithBackoff.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockDetails),
      } as unknown as Response);

      const result = await service.getDataMartDetails('dm-123');

      expect(result.id).toBe('dm-123');
      expect(result.title).toBe('Test Data Mart');
    });

    it('should throw NotFoundException when data mart not found', async () => {
      mockFetchWithBackoff.mockResolvedValue({
        ok: false,
        status: 404,
        text: jest.fn().mockResolvedValue('Not found'),
      } as unknown as Response);

      await expect(service.getDataMartDetails('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteDataMart', () => {
    it('should call DELETE endpoint', async () => {
      mockFetchWithBackoff.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({}),
      } as unknown as Response);

      await service.deleteDataMart('dm-123');

      expect(mockFetchWithBackoff).toHaveBeenCalledWith(
        'https://api.example.com/odm/data-marts/dm-123',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('parseQuery', () => {
    it('should return parsed query on success', async () => {
      mockFetchWithBackoff.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ parsedQuery: 'SELECT * FROM table', error: null }),
      } as unknown as Response);

      const result = await service.parseQuery('SELECT * FROM table');

      expect(result).toBe('SELECT * FROM table');
    });

    it('should throw BusinessViolationException when parsing fails', async () => {
      mockFetchWithBackoff.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          parsedQuery: null,
          error: {
            reason: 'SYNTAX_ERROR',
            message: 'Syntax error',
            variableName: null,
            attributes: null,
            params: null,
          },
        }),
      } as unknown as Response);

      await expect(service.parseQuery('INVALID QUERY')).rejects.toThrow(BusinessViolationException);
    });

    it('should return original query when parsedQuery is null', async () => {
      mockFetchWithBackoff.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ parsedQuery: null, error: null }),
      } as unknown as Response);

      const result = await service.parseQuery('SELECT 1');

      expect(result).toBe('SELECT 1');
    });
  });

  describe('error handling', () => {
    it('should throw BusinessViolationException for 4xx errors', async () => {
      mockFetchWithBackoff.mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue('Bad request'),
      } as unknown as Response);

      await expect(service.getGcpProjectsList('test')).rejects.toThrow(BusinessViolationException);
    });

    it('should throw generic Error for 5xx errors', async () => {
      mockFetchWithBackoff.mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Internal server error'),
      } as unknown as Response);

      await expect(service.getGcpProjectsList('test')).rejects.toThrow(
        'Legacy ODM API request failed'
      );
    });
  });
});
