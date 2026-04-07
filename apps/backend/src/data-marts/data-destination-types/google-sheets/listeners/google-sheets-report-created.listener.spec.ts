import { GoogleSheetsReportCreatedListener } from './google-sheets-report-created.listener';
import { ReportCreatedEvent } from '../../../events/report-created.event';
import { DataDestinationType } from '../../enums/data-destination-type.enum';

describe('GoogleSheetsReportCreatedListener', () => {
  const projectId = 'proj-1';
  const dataMartId = 'dm-1';
  const reportId = 'report-1';
  const spreadsheetId = 'spreadsheet-1';
  const sheetId = 42;

  const makeReport = (overrides: Record<string, unknown> = {}) => ({
    id: reportId,
    destinationConfig: {
      type: 'google-sheets-config',
      spreadsheetId,
      sheetId,
    },
    dataDestination: {
      id: 'dest-1',
      type: DataDestinationType.GOOGLE_SHEETS,
    },
    dataMart: {
      id: dataMartId,
      projectId,
    },
    ...overrides,
  });

  const makeOwoxEntry = (id: number, forReportId = reportId) => ({
    metadataKey: 'OWOX_REPORT_META',
    metadataId: id,
    metadataValue: JSON.stringify({ reportId: forReportId, dataMartId, projectId }),
    location: { sheetId },
  });

  const createListener = () => {
    const mockAdapter = {
      getDeveloperMetadata: jest.fn().mockResolvedValue([]),
      findAllOwoxReportMetadataForSheet: jest.fn().mockReturnValue([]),
      deleteDeveloperMetadata: jest.fn().mockResolvedValue(undefined),
      batchUpdate: jest.fn().mockResolvedValue(undefined),
    };

    const adapterFactory = {
      createFromDestination: jest.fn().mockResolvedValue(mockAdapter),
    };

    const metadataFormatter = {
      createDeveloperMetadataRequest: jest.fn().mockReturnValue({ createDeveloperMetadata: {} }),
      updateDeveloperMetadataRequest: jest.fn().mockReturnValue({ updateDeveloperMetadata: {} }),
    };

    const reportService = {
      getByIdAndDataMartIdAndProjectId: jest.fn().mockResolvedValue(makeReport()),
    };

    const listener = new GoogleSheetsReportCreatedListener(
      adapterFactory as never,
      metadataFormatter as never,
      reportService as never
    );

    return { listener, adapterFactory, metadataFormatter, reportService, mockAdapter };
  };

  const makeEvent = (
    dataDestinationType: DataDestinationType = DataDestinationType.GOOGLE_SHEETS
  ) => new ReportCreatedEvent(reportId, dataMartId, projectId, dataDestinationType, 'user-1');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should skip and not fetch report when destination type is not GOOGLE_SHEETS', async () => {
    const { listener, reportService } = createListener();

    await listener.handleReportCreatedEvent(makeEvent(DataDestinationType.EMAIL));

    expect(reportService.getByIdAndDataMartIdAndProjectId).not.toHaveBeenCalled();
  });

  it('should skip and not fetch report when destination type is LOOKER_STUDIO', async () => {
    const { listener, reportService } = createListener();

    await listener.handleReportCreatedEvent(makeEvent(DataDestinationType.LOOKER_STUDIO));

    expect(reportService.getByIdAndDataMartIdAndProjectId).not.toHaveBeenCalled();
  });

  it('should warn and return when destinationConfig is not a Google Sheets config', async () => {
    const { listener, reportService, adapterFactory } = createListener();
    reportService.getByIdAndDataMartIdAndProjectId.mockResolvedValue(
      makeReport({ destinationConfig: { type: 'looker-studio-config' } })
    );

    await listener.handleReportCreatedEvent(makeEvent());

    expect(adapterFactory.createFromDestination).not.toHaveBeenCalled();
  });

  it('should return when adapter cannot be created (returns null)', async () => {
    const { listener, adapterFactory, metadataFormatter } = createListener();
    adapterFactory.createFromDestination.mockResolvedValue(null);

    await listener.handleReportCreatedEvent(makeEvent());

    expect(metadataFormatter.createDeveloperMetadataRequest).not.toHaveBeenCalled();
    expect(metadataFormatter.updateDeveloperMetadataRequest).not.toHaveBeenCalled();
  });

  it('should call createDeveloperMetadataRequest when no existing OWOX metadata', async () => {
    const { listener, mockAdapter, metadataFormatter } = createListener();
    mockAdapter.getDeveloperMetadata.mockResolvedValue([]);
    mockAdapter.findAllOwoxReportMetadataForSheet.mockReturnValue([]);

    await listener.handleReportCreatedEvent(makeEvent());

    expect(metadataFormatter.createDeveloperMetadataRequest).toHaveBeenCalledWith(
      sheetId,
      projectId,
      dataMartId,
      reportId
    );
    expect(metadataFormatter.updateDeveloperMetadataRequest).not.toHaveBeenCalled();
    expect(mockAdapter.batchUpdate).toHaveBeenCalledWith(spreadsheetId, [
      { createDeveloperMetadata: {} },
    ]);
  });

  it('should call updateDeveloperMetadataRequest when OWOX metadata exists for the same report', async () => {
    const metadataId = 999;
    const { listener, mockAdapter, metadataFormatter } = createListener();
    const existingEntry = makeOwoxEntry(metadataId, reportId);
    mockAdapter.getDeveloperMetadata.mockResolvedValue([existingEntry]);
    mockAdapter.findAllOwoxReportMetadataForSheet.mockReturnValue([existingEntry]);

    await listener.handleReportCreatedEvent(makeEvent());

    expect(metadataFormatter.updateDeveloperMetadataRequest).toHaveBeenCalledWith(
      metadataId,
      projectId,
      dataMartId,
      reportId
    );
    expect(metadataFormatter.createDeveloperMetadataRequest).not.toHaveBeenCalled();
    expect(mockAdapter.batchUpdate).toHaveBeenCalledWith(spreadsheetId, [
      { updateDeveloperMetadata: {} },
    ]);
  });

  it('should log warn and overwrite when OWOX metadata exists for a different report', async () => {
    const metadataId = 999;
    const { listener, mockAdapter, metadataFormatter } = createListener();
    const existingEntry = makeOwoxEntry(metadataId, 'other-report-id');
    mockAdapter.getDeveloperMetadata.mockResolvedValue([existingEntry]);
    mockAdapter.findAllOwoxReportMetadataForSheet.mockReturnValue([existingEntry]);

    const warnSpy = jest.spyOn((listener as any).logger, 'warn').mockImplementation(() => {});

    await listener.handleReportCreatedEvent(makeEvent());

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('other-report-id'));
    expect(metadataFormatter.updateDeveloperMetadataRequest).toHaveBeenCalledWith(
      metadataId,
      projectId,
      dataMartId,
      reportId
    );
    expect(metadataFormatter.createDeveloperMetadataRequest).not.toHaveBeenCalled();
  });

  it('should log warn, delete duplicates and create fresh entry when multiple OWOX metadata exist', async () => {
    const { listener, mockAdapter, metadataFormatter } = createListener();
    const duplicates = [makeOwoxEntry(111, reportId), makeOwoxEntry(222, 'other-report-id')];
    mockAdapter.getDeveloperMetadata.mockResolvedValue(duplicates);
    mockAdapter.findAllOwoxReportMetadataForSheet.mockReturnValue(duplicates);

    const warnSpy = jest.spyOn((listener as any).logger, 'warn').mockImplementation(() => {});

    await listener.handleReportCreatedEvent(makeEvent());

    expect(warnSpy).toHaveBeenCalled();
    expect(mockAdapter.deleteDeveloperMetadata).toHaveBeenCalledWith(spreadsheetId, [111, 222]);
    expect(metadataFormatter.createDeveloperMetadataRequest).toHaveBeenCalledWith(
      sheetId,
      projectId,
      dataMartId,
      reportId
    );
    expect(metadataFormatter.updateDeveloperMetadataRequest).not.toHaveBeenCalled();
  });

  it('should log error and not throw when batchUpdate fails', async () => {
    const { listener, mockAdapter } = createListener();
    mockAdapter.getDeveloperMetadata.mockResolvedValue([]);
    mockAdapter.findAllOwoxReportMetadataForSheet.mockReturnValue([]);
    mockAdapter.batchUpdate.mockRejectedValue(new Error('API quota exceeded'));

    await expect(listener.handleReportCreatedEvent(makeEvent())).resolves.not.toThrow();
  });
});
