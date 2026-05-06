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

  describe('buildImportedColumnNote', () => {
    const baseArgs = {
      title: 'Test Data Mart',
      url: 'https://app.owox.com/ui/proj-1/dm-2',
      date: '2026-04-02 12:00:00 UTC',
    };

    it('places description first followed by the ODM info block', () => {
      const note = formatter.buildImportedColumnNote(
        'Total revenue per campaign per day',
        baseArgs.title,
        baseArgs.url,
        baseArgs.date,
        false
      );

      const lines = note.split('\n');
      // Description on the first line; ODM info begins after the `---` separator.
      expect(lines[0]).toBe('Total revenue per campaign per day');
      expect(note).toContain('\n---\n');
      expect(note).toContain('Imported via OWOX Data Marts at 2026-04-02 12:00:00 UTC');
      expect(note).toContain(`Data Mart: ${baseArgs.title}`);
      expect(note).toContain(`Data Mart page: ${baseArgs.url}`);
      expect(note.indexOf('Imported via')).toBeGreaterThan(note.indexOf('---'));
    });

    it('omits description and separator when description is undefined', () => {
      const note = formatter.buildImportedColumnNote(
        undefined,
        baseArgs.title,
        baseArgs.url,
        baseArgs.date,
        false
      );

      expect(note.startsWith('Imported via OWOX Data Marts')).toBe(true);
      expect(note).not.toContain('---');
    });

    it('appends Community Edition suffix to ODM info', () => {
      const note = formatter.buildImportedColumnNote(
        'desc',
        baseArgs.title,
        baseArgs.url,
        baseArgs.date,
        true
      );
      expect(note).toContain('OWOX Data Marts Community Edition');
    });

    it('truncates oversize descriptions before composing the note', () => {
      const oversize = 'x'.repeat(46_000);
      const note = formatter.buildImportedColumnNote(
        oversize,
        baseArgs.title,
        baseArgs.url,
        baseArgs.date,
        false
      );

      // Truncated to 45,000 chars + ellipsis; ODM info block still fits.
      expect(note.length).toBeLessThan(50_000);
      expect(note).toContain('…\n---\n');
      expect(note).toContain('Imported via OWOX Data Marts');
    });
  });

  describe('createOwoxColumnsMetadataRequest', () => {
    it('serializes columns as a JSON array of {name, alias?} bound to the sheet', () => {
      const result = formatter.createOwoxColumnsMetadataRequest(42, [
        { name: 'date', alias: 'Date' },
        { name: 'campaign' },
        { name: 'cost', alias: 'Cost' },
      ]);

      expect(result.createDeveloperMetadata).toBeDefined();
      const metadata = result.createDeveloperMetadata?.developerMetadata;
      expect(metadata?.metadataKey).toBe('OWOX_COLUMNS');
      expect(metadata?.visibility).toBe('DOCUMENT');
      expect(metadata?.location?.sheetId).toBe(42);
      expect(JSON.parse(metadata!.metadataValue!)).toEqual([
        { name: 'date', alias: 'Date' },
        { name: 'campaign' },
        { name: 'cost', alias: 'Cost' },
      ]);
    });

    it('omits the alias key entirely when no alias is provided', () => {
      const result = formatter.createOwoxColumnsMetadataRequest(1, [{ name: 'a' }]);
      const value = result.createDeveloperMetadata?.developerMetadata?.metadataValue;
      // Stricter than `toEqual`: the persisted JSON must not carry
      // `"alias":null` since downstream parsers treat null as a real value.
      expect(value).toBe('[{"name":"a"}]');
    });
  });

  describe('updateOwoxColumnsMetadataRequest', () => {
    it('updates only metadataValue and uses dataFilters lookup by metadataId', () => {
      const result = formatter.updateOwoxColumnsMetadataRequest(7, [
        { name: 'a' },
        { name: 'b', alias: 'Bee' },
      ]);

      const dataFilter = result.updateDeveloperMetadata?.dataFilters?.[0];
      expect(dataFilter?.developerMetadataLookup?.metadataId).toBe(7);
      expect(result.updateDeveloperMetadata?.fields).toBe('metadataValue');

      const metadata = result.updateDeveloperMetadata?.developerMetadata;
      expect(JSON.parse(metadata!.metadataValue!)).toEqual([
        { name: 'a' },
        { name: 'b', alias: 'Bee' },
      ]);
    });
  });
});
