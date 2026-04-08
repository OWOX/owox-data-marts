import { SheetMetadataFormatter } from './sheet-metadata-formatter';

describe('SheetMetadataFormatter', () => {
  let formatter: SheetMetadataFormatter;

  beforeEach(() => {
    formatter = new SheetMetadataFormatter();
  });

  describe('createTabColorAndFreezeHeaderRequest', () => {
    it('should create valid tab color and freeze header request', () => {
      const result = formatter.createTabColorAndFreezeHeaderRequest(123);

      expect(result.updateSheetProperties).toBeDefined();
      expect(result.updateSheetProperties?.properties?.sheetId).toBe(123);
      expect(result.updateSheetProperties?.properties?.gridProperties?.frozenRowCount).toBe(1);
      expect(result.updateSheetProperties?.properties?.tabColorStyle).toBeDefined();
      expect(result.updateSheetProperties?.fields).toBe(
        'tabColorStyle,gridProperties.frozenRowCount'
      );
    });
  });

  describe('createMetadataNoteRequest', () => {
    it('should create valid metadata note request', () => {
      const result = formatter.createMetadataNoteRequest(
        123,
        '2026-04-02 12:00:00 UTC',
        'Test Data Mart',
        'https://app.owox.com/ui/proj-123/dm-456',
        false,
        'First column description'
      );

      expect(result.repeatCell).toBeDefined();
      expect(result.repeatCell?.range?.sheetId).toBe(123);
      expect(result.repeatCell?.range?.startRowIndex).toBe(0);
      expect(result.repeatCell?.range?.endRowIndex).toBe(1);
      expect(result.repeatCell?.range?.startColumnIndex).toBe(0);
      expect(result.repeatCell?.range?.endColumnIndex).toBe(1);

      const note = result.repeatCell?.cell?.note;
      expect(note).toContain('Imported via OWOX Data Marts at 2026-04-02 12:00:00 UTC');
      expect(note).toContain('Data Mart: Test Data Mart');
      expect(note).toContain('Data Mart page: https://app.owox.com/ui/proj-123/dm-456');
      expect(note).toContain('First column description');
    });

    it('should add Community Edition suffix when isCommunityEdition is true', () => {
      const result = formatter.createMetadataNoteRequest(
        123,
        '2026-04-02 12:00:00 UTC',
        'Test Data Mart',
        'https://app.owox.com/ui/proj-123/dm-456',
        true
      );

      const note = result.repeatCell?.cell?.note;
      expect(note).toContain('Imported via OWOX Data Marts Community Edition');
    });

    it('should omit first column description when not provided', () => {
      const result = formatter.createMetadataNoteRequest(
        123,
        '2026-04-02 12:00:00 UTC',
        'Test Data Mart',
        'https://app.owox.com/ui/proj-123/dm-456',
        false
      );

      const note = result.repeatCell?.cell?.note;
      expect(note).not.toContain('---');
    });
  });

  describe('createDeveloperMetadataRequest', () => {
    it('should create valid developer metadata request per gas.md specification', () => {
      const result = formatter.createDeveloperMetadataRequest(
        42,
        'proj_abc123',
        'dm_xyz789',
        'rpt_def456'
      );

      expect(result.createDeveloperMetadata).toBeDefined();

      const metadata = result.createDeveloperMetadata?.developerMetadata;
      expect(metadata?.metadataKey).toBe('OWOX_REPORT_META');
      expect(metadata?.visibility).toBe('DOCUMENT');
      expect(metadata?.location?.sheetId).toBe(42);

      // Parse and validate metadata value
      expect(metadata?.metadataValue).toBeDefined();
      const parsedValue = JSON.parse(metadata!.metadataValue!);
      expect(parsedValue.reportId).toBe('rpt_def456');
      expect(parsedValue.dataMartId).toBe('dm_xyz789');
      expect(parsedValue.projectId).toBe('proj_abc123');

      // Ensure no extra fields
      expect(Object.keys(parsedValue).sort()).toEqual(['dataMartId', 'projectId', 'reportId']);
    });

    it('should stringify metadata value as JSON', () => {
      const result = formatter.createDeveloperMetadataRequest(1, 'proj-1', 'dm-2', 'rpt-3');

      const metadataValue = result.createDeveloperMetadata?.developerMetadata?.metadataValue;
      expect(typeof metadataValue).toBe('string');

      const parsed = JSON.parse(metadataValue!);
      expect(typeof parsed.reportId).toBe('string');
      expect(typeof parsed.dataMartId).toBe('string');
      expect(typeof parsed.projectId).toBe('string');
    });
  });

  describe('updateDeveloperMetadataRequest', () => {
    it('should create valid update developer metadata request with dataFilter', () => {
      const result = formatter.updateDeveloperMetadataRequest(
        999,
        'proj_updated',
        'dm_updated',
        'rpt_updated'
      );

      expect(result.updateDeveloperMetadata).toBeDefined();

      // metadataId must be in dataFilters, not in developerMetadata
      const dataFilter = result.updateDeveloperMetadata?.dataFilters?.[0];
      expect(dataFilter?.developerMetadataLookup?.metadataId).toBe(999);

      expect(result.updateDeveloperMetadata?.fields).toBe('metadataValue');

      const metadata = result.updateDeveloperMetadata?.developerMetadata;
      const parsedValue = JSON.parse(metadata!.metadataValue!);
      expect(parsedValue.reportId).toBe('rpt_updated');
      expect(parsedValue.dataMartId).toBe('dm_updated');
      expect(parsedValue.projectId).toBe('proj_updated');
    });
  });

  describe('createNoteRequest', () => {
    it('should create valid note request', () => {
      const result = formatter.createNoteRequest(123, 'Test note', 5, 10);

      expect(result.repeatCell).toBeDefined();
      expect(result.repeatCell?.range?.sheetId).toBe(123);
      expect(result.repeatCell?.range?.startRowIndex).toBe(5);
      expect(result.repeatCell?.range?.endRowIndex).toBe(6);
      expect(result.repeatCell?.range?.startColumnIndex).toBe(10);
      expect(result.repeatCell?.range?.endColumnIndex).toBe(11);
      expect(result.repeatCell?.cell?.note).toBe('Test note');
      expect(result.repeatCell?.fields).toBe('note');
    });

    it('should handle null note', () => {
      const result = formatter.createNoteRequest(123, null, 0, 0);

      expect(result.repeatCell?.cell?.note).toBeNull();
    });
  });
});
