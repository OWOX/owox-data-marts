import { GoogleSheetsReportDeletedListener } from './google-sheets-report-deleted.listener';
import { DataDestinationType } from '../../enums/data-destination-type.enum';
import { DataDestination } from '../../../entities/data-destination.entity';
import { ReportDeletedEvent } from '../../../events/report-deleted.event';

describe('GoogleSheetsReportDeletedListener', () => {
  const spreadsheetId = 'spreadsheet-1';
  const sheetId = 42;

  const makeEvent = (overrides: Partial<ReportDeletedEvent['payload']> = {}): ReportDeletedEvent =>
    ({
      payload: {
        reportId: 'report-1',
        dataMartId: 'dm-1',
        projectId: 'proj-1',
        dataDestinationId: 'dest-1',
        dataDestinationType: DataDestinationType.GOOGLE_SHEETS,
        destinationConfig: {
          type: 'google-sheets-config',
          spreadsheetId,
          sheetId,
        },
        ...overrides,
      },
    }) as unknown as ReportDeletedEvent;

  const mockDestination = {
    id: 'dest-1',
    type: DataDestinationType.GOOGLE_SHEETS,
  } as DataDestination;

  const createListener = () => {
    const mockAdapter = {
      getDeveloperMetadata: jest.fn().mockResolvedValue([]),
      findOwoxReportMetadata: jest.fn().mockReturnValue(undefined),
      findAllOwoxReportMetadataForSheet: jest.fn().mockReturnValue([]),
      deleteDeveloperMetadata: jest.fn().mockResolvedValue(undefined),
    };

    const adapterFactory = {
      createFromDestination: jest.fn().mockResolvedValue(mockAdapter),
    };

    const dataDestinationRepository = {
      findOne: jest.fn().mockResolvedValue(mockDestination),
    };

    const listener = new GoogleSheetsReportDeletedListener(
      adapterFactory as never,
      dataDestinationRepository as never
    );

    return { listener, adapterFactory, mockAdapter, dataDestinationRepository };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should skip when destination type is not GOOGLE_SHEETS', async () => {
    const { listener, adapterFactory } = createListener();

    await listener.handleReportDeletedEvent(
      makeEvent({ dataDestinationType: DataDestinationType.LOOKER_STUDIO })
    );

    expect(adapterFactory.createFromDestination).not.toHaveBeenCalled();
  });

  it('should warn and return when destinationConfig is not a Google Sheets config', async () => {
    const { listener, adapterFactory } = createListener();

    await listener.handleReportDeletedEvent(
      makeEvent({ destinationConfig: { type: 'looker-studio-config' } as never })
    );

    expect(adapterFactory.createFromDestination).not.toHaveBeenCalled();
  });

  it('should return when adapter cannot be created (returns null)', async () => {
    const { listener, adapterFactory, mockAdapter } = createListener();
    adapterFactory.createFromDestination.mockResolvedValue(null);

    await listener.handleReportDeletedEvent(makeEvent());

    expect(mockAdapter.getDeveloperMetadata).not.toHaveBeenCalled();
    expect(mockAdapter.deleteDeveloperMetadata).not.toHaveBeenCalled();
  });

  it('should return when no OWOX metadata found on the sheet', async () => {
    const { listener, mockAdapter } = createListener();
    mockAdapter.getDeveloperMetadata.mockResolvedValue([]);
    mockAdapter.findAllOwoxReportMetadataForSheet.mockReturnValue([]);

    await listener.handleReportDeletedEvent(makeEvent());

    expect(mockAdapter.deleteDeveloperMetadata).not.toHaveBeenCalled();
  });

  it('should call deleteDeveloperMetadata with correct metadataId', async () => {
    const metadataId = 777;
    const { listener, mockAdapter } = createListener();
    const existingEntry = {
      metadataKey: 'OWOX_REPORT_META',
      metadataId,
      metadataValue: JSON.stringify({
        reportId: 'report-1',
        dataMartId: 'dm-1',
        projectId: 'proj-1',
      }),
      location: { sheetId },
    };
    mockAdapter.getDeveloperMetadata.mockResolvedValue([existingEntry]);
    mockAdapter.findAllOwoxReportMetadataForSheet.mockReturnValue([existingEntry]);

    await listener.handleReportDeletedEvent(makeEvent());

    expect(mockAdapter.deleteDeveloperMetadata).toHaveBeenCalledWith(spreadsheetId, [metadataId]);
  });

  it('should delete ALL duplicate metadata entries for the same report when multiple exist', async () => {
    const { listener, mockAdapter } = createListener();
    const metadataValue = JSON.stringify({
      reportId: 'report-1',
      dataMartId: 'dm-1',
      projectId: 'proj-1',
    });
    const metadataEntries = [
      { metadataKey: 'OWOX_REPORT_META', metadataId: 111, metadataValue, location: { sheetId } },
      { metadataKey: 'OWOX_REPORT_META', metadataId: 222, metadataValue, location: { sheetId } },
      { metadataKey: 'OWOX_REPORT_META', metadataId: 333, metadataValue, location: { sheetId } },
    ];
    mockAdapter.getDeveloperMetadata.mockResolvedValue(metadataEntries);
    mockAdapter.findAllOwoxReportMetadataForSheet.mockReturnValue(metadataEntries);

    await listener.handleReportDeletedEvent(makeEvent());

    expect(mockAdapter.deleteDeveloperMetadata).toHaveBeenCalledWith(
      spreadsheetId,
      [111, 222, 333]
    );
  });

  it('should not delete metadata that belongs to a different report', async () => {
    const { listener, mockAdapter } = createListener();
    const otherReportEntry = {
      metadataKey: 'OWOX_REPORT_META',
      metadataId: 999,
      metadataValue: JSON.stringify({
        reportId: 'other-report-id',
        dataMartId: 'dm-1',
        projectId: 'proj-1',
      }),
      location: { sheetId },
    };
    mockAdapter.getDeveloperMetadata.mockResolvedValue([otherReportEntry]);
    mockAdapter.findAllOwoxReportMetadataForSheet.mockReturnValue([otherReportEntry]);

    await listener.handleReportDeletedEvent(makeEvent());

    expect(mockAdapter.deleteDeveloperMetadata).not.toHaveBeenCalled();
  });

  it('should log error and not throw when deleteDeveloperMetadata fails', async () => {
    const metadataId = 777;
    const { listener, mockAdapter } = createListener();
    const existingEntry = {
      metadataKey: 'OWOX_REPORT_META',
      metadataId,
      metadataValue: JSON.stringify({
        reportId: 'report-1',
        dataMartId: 'dm-1',
        projectId: 'proj-1',
      }),
      location: { sheetId },
    };
    mockAdapter.getDeveloperMetadata.mockResolvedValue([existingEntry]);
    mockAdapter.findAllOwoxReportMetadataForSheet.mockReturnValue([existingEntry]);
    mockAdapter.deleteDeveloperMetadata.mockRejectedValue(new Error('Permission denied'));

    await expect(listener.handleReportDeletedEvent(makeEvent())).resolves.not.toThrow();
  });

  it('should return when dataDestination is not found in database', async () => {
    const { listener, dataDestinationRepository, mockAdapter } = createListener();
    dataDestinationRepository.findOne.mockResolvedValue(null);

    await listener.handleReportDeletedEvent(makeEvent());

    expect(mockAdapter.getDeveloperMetadata).not.toHaveBeenCalled();
    expect(mockAdapter.deleteDeveloperMetadata).not.toHaveBeenCalled();
  });
});
