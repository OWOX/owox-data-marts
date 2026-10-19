jest.mock('snowflake-sdk', () => ({ __esModule: true, default: {} }));
import { DataMartModelService } from './data-mart-model.service';
import { PreviewDataMartService } from './preview-data-mart.service';
import { McpDataMartModelMapper } from '../mappers/mcp-data-mart-model.mapper';
import { ForbiddenException } from '@nestjs/common';

it('uses the existing preview implementation and maps only after successful domain work', async () => {
  const preview = { runForSetup: jest.fn().mockResolvedValue({ preview: {} }) };
  const mapper = { toPreview: jest.fn().mockReturnValue({ result: 'mapped' }) };
  const service = new DataMartModelService(
    preview as unknown as PreviewDataMartService,
    mapper as unknown as McpDataMartModelMapper
  );
  const request = {
    projectId: 'project',
    userId: 'user',
    roles: ['editor' as const],
    dataMartId: 'mart',
    limit: 10,
  };
  const signal = new AbortController().signal;
  await expect(service.preview(request, signal)).resolves.toEqual({ result: 'mapped' });
  expect(preview.runForSetup).toHaveBeenCalledWith(expect.objectContaining(request), signal);
  expect(mapper.toPreview).toHaveBeenCalledWith('mart', { preview: {} });
  preview.runForSetup.mockRejectedValue(new Error('domain denied'));
  await expect(service.preview(request, signal)).rejects.toThrow('domain denied');
  expect(mapper.toPreview).toHaveBeenCalledTimes(1);
});

it('rejects an anonymous direct domain invocation before preview', async () => {
  const preview = { runForSetup: jest.fn() };
  const service = new DataMartModelService(
    preview as unknown as PreviewDataMartService,
    {} as McpDataMartModelMapper
  );
  await expect(
    service.preview({ projectId: '', userId: '', roles: [], dataMartId: 'mart' })
  ).rejects.toThrow();
  expect(preview.runForSetup).not.toHaveBeenCalled();
});

it.each([{ roles: [] }, { roles: ['viewer'] as const }])(
  'rejects roles $roles before invoking preview',
  async ({ roles }) => {
    const preview = { runForSetup: jest.fn() };
    const service = new DataMartModelService(
      preview as unknown as PreviewDataMartService,
      {} as McpDataMartModelMapper
    );
    await expect(
      service.preview({
        projectId: 'project',
        userId: 'user',
        roles: [...roles],
        dataMartId: 'mart',
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(preview.runForSetup).not.toHaveBeenCalled();
  }
);
