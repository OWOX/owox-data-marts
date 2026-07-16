import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataMartService } from './data-mart.service.ts';
import apiClient from '../../../../app/api/apiClient.ts';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum.ts';
import type { CreateDataMartRequestDto } from '../types/api';
import { DataMartStatus } from '../enums/data-mart-status.enum.ts';

vi.mock('../../../../app/api/apiClient.ts', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('DataMartService', () => {
  let service: DataMartService;

  const mockDataMartId = '123';
  const mockDataMartResponse = { id: mockDataMartId, title: 'Test Data Mart' };
  const mockCreateData = { title: 'New Data Mart' } as CreateDataMartRequestDto;
  const mockUpdateData = { title: 'Updated Data Mart' };
  const mockDefinition = { sqlQuery: 'SELECT * FROM table' };

  beforeEach(() => {
    service = new DataMartService();

    vi.resetAllMocks();

    // Setup default mock responses
    (apiClient.get as any).mockResolvedValue({ data: {} });
    (apiClient.post as any).mockResolvedValue({ data: {} });
    (apiClient.put as any).mockResolvedValue({ data: {} });
    (apiClient.patch as any).mockResolvedValue({ data: {} });
    (apiClient.delete as any).mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should be initialized with the correct base URL', () => {
    // @ts-expect-error accessing private property for testing
    expect(service.baseUrl).toBe('/data-marts');
  });

  describe('getDataMarts', () => {
    it('should fetch all data marts with pagination', async () => {
      (apiClient.get as any).mockResolvedValueOnce({
        data: { items: [mockDataMartResponse], total: 1, nextOffset: null },
      });

      const result = await service.getDataMarts();

      expect(apiClient.get).toHaveBeenCalledWith('/data-marts/', { params: {} });
      expect(result).toEqual([mockDataMartResponse]);
    });

    it('should fetch multiple pages when nextOffset is not null', async () => {
      const secondItem = { id: '456', title: 'Second Data Mart' };
      (apiClient.get as any)
        .mockResolvedValueOnce({
          data: { items: [mockDataMartResponse], total: 2, nextOffset: 50 },
        })
        .mockResolvedValueOnce({
          data: { items: [secondItem], total: 2, nextOffset: null },
        });

      const result = await service.getDataMarts();

      expect(apiClient.get).toHaveBeenCalledTimes(2);
      expect(apiClient.get).toHaveBeenNthCalledWith(1, '/data-marts/', { params: {} });
      expect(apiClient.get).toHaveBeenNthCalledWith(2, '/data-marts/', { params: { offset: 50 } });
      expect(result).toEqual([mockDataMartResponse, secondItem]);
    });
  });

  describe('getDataMartById', () => {
    it('should fetch a data mart by ID', async () => {
      (apiClient.get as any).mockResolvedValueOnce({ data: mockDataMartResponse });

      const result = await service.getDataMartById(mockDataMartId);

      expect(apiClient.get).toHaveBeenCalledWith(`/data-marts/${mockDataMartId}`, {
        params: undefined,
      });
      expect(result).toEqual(mockDataMartResponse);
    });
  });

  describe('getProjectDataMartRuns', () => {
    it('should fetch project-wide data mart runs', async () => {
      const response = { runs: [] };
      (apiClient.get as any).mockResolvedValueOnce({ data: response });

      const result = await service.getProjectDataMartRuns(20, 40);

      expect(apiClient.get).toHaveBeenCalledWith('/data-marts/runs', {
        params: { limit: 20, offset: 40 },
      });
      expect(result).toEqual(response);
    });
  });

  describe('createDataMart', () => {
    it('should create a new data mart', async () => {
      (apiClient.post as any).mockResolvedValueOnce({ data: mockDataMartResponse });

      const result = await service.createDataMart(mockCreateData);

      expect(apiClient.post).toHaveBeenCalledWith('/data-marts', mockCreateData, undefined);
      expect(result).toEqual(mockDataMartResponse);
    });
  });

  describe('updateDataMart', () => {
    it('should update an existing data mart', async () => {
      (apiClient.patch as any).mockResolvedValueOnce({ data: mockDataMartResponse });

      const result = await service.updateDataMart(mockDataMartId, mockUpdateData);

      expect(apiClient.patch).toHaveBeenCalledWith(
        `/data-marts/${mockDataMartId}`,
        mockUpdateData,
        undefined
      );
      expect(result).toEqual(mockDataMartResponse);
    });
  });

  describe('deleteDataMart', () => {
    it('should delete a data mart', async () => {
      (apiClient.delete as any).mockResolvedValueOnce({ data: undefined });

      await service.deleteDataMart(mockDataMartId);

      expect(apiClient.delete).toHaveBeenCalledWith(`/data-marts/${mockDataMartId}`, undefined);
    });
  });

  describe('runDataMart', () => {
    it('returns the exact run id created by the manual-run endpoint', async () => {
      (apiClient.post as any).mockResolvedValueOnce({ data: { runId: 'manual-run-1' } });

      const result = await service.runDataMart(mockDataMartId, { mode: 'incremental' });

      expect(apiClient.post).toHaveBeenCalledWith(
        `/data-marts/${mockDataMartId}/manual-run`,
        { payload: { mode: 'incremental' } },
        undefined
      );
      expect(result.runId).toBe('manual-run-1');
    });
  });

  describe('cancelDataMartRun', () => {
    it('should suppress the global error toast so the run history button can show the specific message', async () => {
      await service.cancelDataMartRun(mockDataMartId, 'run-1');

      expect(apiClient.post).toHaveBeenCalledWith(
        `/data-marts/${mockDataMartId}/runs/run-1/cancel`,
        undefined,
        { skipErrorToast: true }
      );
    });
  });

  describe('updateDataMartDescription', () => {
    it('should update a data mart description', async () => {
      const description = 'New description';
      (apiClient.put as any).mockResolvedValueOnce({
        data: { ...mockDataMartResponse, description },
      });

      const result = await service.updateDataMartDescription(mockDataMartId, description);

      expect(apiClient.put).toHaveBeenCalledWith(
        `/data-marts/${mockDataMartId}/description`,
        { description },
        undefined
      );
      expect(result).toEqual({ ...mockDataMartResponse, description });
    });

    it('should remove a data mart description when null is provided', async () => {
      (apiClient.put as any).mockResolvedValueOnce({
        data: { ...mockDataMartResponse, description: null },
      });

      const result = await service.updateDataMartDescription(mockDataMartId, null);

      expect(apiClient.put).toHaveBeenCalledWith(
        `/data-marts/${mockDataMartId}/description`,
        { description: null },
        undefined
      );
      expect(result).toEqual({ ...mockDataMartResponse, description: null });
    });
  });

  describe('updateDataMartTitle', () => {
    it('should update a data mart title', async () => {
      const title = 'New title';
      (apiClient.put as any).mockResolvedValueOnce({ data: { ...mockDataMartResponse, title } });

      const result = await service.updateDataMartTitle(mockDataMartId, title);

      expect(apiClient.put).toHaveBeenCalledWith(
        `/data-marts/${mockDataMartId}/title`,
        { title },
        undefined
      );
      expect(result).toEqual({ ...mockDataMartResponse, title });
    });
  });

  describe('updateDataMartDefinition', () => {
    it('should update a data mart definition', async () => {
      const definitionType = DataMartDefinitionType.SQL;
      (apiClient.put as any).mockResolvedValueOnce({
        data: {
          ...mockDataMartResponse,
          definitionType,
          definition: mockDefinition,
        },
      });

      const result = await service.updateDataMartDefinition(mockDataMartId, {
        definitionType: DataMartDefinitionType.SQL,
        definition: mockDefinition,
      });

      expect(apiClient.put).toHaveBeenCalledWith(
        `/data-marts/${mockDataMartId}/definition`,
        { definitionType, definition: mockDefinition },
        { timeout: 180000 }
      );
      expect(result).toEqual({
        ...mockDataMartResponse,
        definitionType,
        definition: mockDefinition,
      });
    });
  });

  describe('publishDataMart', () => {
    it('should publish a data mart', async () => {
      const publishedMart = { ...mockDataMartResponse, status: DataMartStatus.PUBLISHED };
      (apiClient.put as any).mockResolvedValueOnce({ data: publishedMart });

      const result = await service.publishDataMart(mockDataMartId);

      expect(apiClient.put).toHaveBeenCalledWith(
        `/data-marts/${mockDataMartId}/publish`,
        undefined,
        { timeout: 180000 }
      );
      expect(result).toEqual(publishedMart);
    });
  });
});
