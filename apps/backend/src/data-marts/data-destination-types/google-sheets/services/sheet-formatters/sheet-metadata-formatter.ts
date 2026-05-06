import { Injectable, Logger } from '@nestjs/common';
import { sheets_v4 } from 'googleapis';
import { GOOGLE_SHEETS_METADATA_KEYS } from '../../constants/google-sheets-metadata-keys.constants';

/**
 * Maximum length of a column description embedded into a per-cell note before
 * we truncate. Google Sheets caps cell notes at ~50,000 characters; the limit
 * leaves room for the appended ODM info block.
 */
const MAX_DESCRIPTION_LENGTH_IN_NOTE = 45_000;

/**
 * Service for formatting metadata in Google Sheets
 * Provides methods to create metadata formatting requests
 */
@Injectable()
export class SheetMetadataFormatter {
  private readonly logger = new Logger(SheetMetadataFormatter.name);

  /**
   * Tab color for sheets
   * Blue color (RGB: 30, 136, 229)
   */
  private static readonly TAB_COLOR = {
    red: 30 / 255,
    green: 136 / 255,
    blue: 229 / 255,
    alpha: 1.0,
  };

  /**
   * Creates a request to set tab color and freeze the header row
   *
   * @param sheetId - ID of the sheet to format
   * @returns Google Sheets API request object for tab color and frozen header
   */
  public createTabColorAndFreezeHeaderRequest(sheetId: number): sheets_v4.Schema$Request {
    return {
      updateSheetProperties: {
        properties: {
          sheetId: sheetId,
          gridProperties: {
            frozenRowCount: 1,
          },
          tabColorStyle: {
            rgbColor: SheetMetadataFormatter.TAB_COLOR,
          },
        },
        fields: 'tabColorStyle,gridProperties.frozenRowCount',
      },
    };
  }

  /**
   * Creates a request to add a note to a specific cell
   * @param sheetId - ID of the sheet to add the note to
   * @param note - Note text to be added
   * @param rowIndex - Row index of the cell to add the note to
   * @param columnIndex - Column index of the cell to add the note to
   * @returns Google Sheets API request object for note
   */
  public createNoteRequest(
    sheetId: number,
    note: string | null | undefined,
    rowIndex: number,
    columnIndex: number
  ): sheets_v4.Schema$Request {
    return {
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: rowIndex,
          endRowIndex: rowIndex + 1,
          startColumnIndex: columnIndex,
          endColumnIndex: columnIndex + 1,
        },
        cell: {
          note: note ?? null,
        },
        fields: 'note',
      },
    };
  }

  /**
   * Creates a request to add developer metadata to a specific sheet
   *
   * - metadataKey: GOOGLE_SHEETS_METADATA_KEYS.REPORT_META
   * - metadataValue: JSON string with reportId, dataMartId, projectId
   * - visibility: DOCUMENT (accessible to all users with document access)
   * - location: Bound to specific sheet via sheetId
   *
   * @param sheetId - ID of the sheet to associate metadata with
   * @param projectId - OWOX Project ID
   * @param dataMartId - OWOX DataMart ID
   * @param reportId - OWOX Report ID
   * @returns Google Sheets API request object for developer metadata
   */
  public createDeveloperMetadataRequest(
    sheetId: number,
    projectId: string,
    dataMartId: string,
    reportId: string
  ): sheets_v4.Schema$Request {
    return {
      createDeveloperMetadata: {
        developerMetadata: {
          metadataKey: GOOGLE_SHEETS_METADATA_KEYS.REPORT_META,
          metadataValue: this.buildOwoxMetadataValue(reportId, dataMartId, projectId),
          visibility: 'DOCUMENT',
          location: {
            sheetId,
          },
        },
      },
    };
  }

  /**
   * Creates a request to update existing developer metadata on a sheet
   *
   * @param metadataId - ID of the existing metadata to update
   * @param projectId - OWOX Project ID
   * @param dataMartId - OWOX DataMart ID
   * @param reportId - OWOX Report ID
   * @returns Google Sheets API request object for updating developer metadata
   */
  public updateDeveloperMetadataRequest(
    metadataId: number,
    projectId: string,
    dataMartId: string,
    reportId: string
  ): sheets_v4.Schema$Request {
    return {
      updateDeveloperMetadata: {
        dataFilters: [
          {
            developerMetadataLookup: {
              metadataId,
            },
          },
        ],
        developerMetadata: {
          metadataValue: this.buildOwoxMetadataValue(reportId, dataMartId, projectId),
        },
        fields: 'metadataValue',
      },
    };
  }

  /**
   * Builds the cell-note text written into every header cell ODM owns.
   *
   * The column's own description is placed first (so users see the relevant
   * context immediately), followed by ODM provenance info — date, data mart
   * title, and link back to the OWOX UI. If the description is empty or
   * exceeds {@link MAX_DESCRIPTION_LENGTH_IN_NOTE} characters, it is omitted
   * or truncated with an ellipsis to stay within Sheets' note size limit.
   */
  public buildImportedColumnNote(
    description: string | undefined,
    dataMartTitle: string,
    dataMartUrl: string,
    dateFormatted: string,
    isCommunityEdition: boolean
  ): string {
    const editionSuffix = isCommunityEdition ? ' Community Edition' : '';
    const odmInfo =
      `Imported via OWOX Data Marts${editionSuffix} at ${dateFormatted}\n` +
      `Data Mart: ${dataMartTitle}\n` +
      `Data Mart page: ${dataMartUrl}`;

    if (!description) {
      return odmInfo;
    }

    let safeDescription = description;
    if (description.length > MAX_DESCRIPTION_LENGTH_IN_NOTE) {
      this.logger.warn(
        `Column description exceeds ${MAX_DESCRIPTION_LENGTH_IN_NOTE} chars; truncating before writing as cell note.`
      );
      safeDescription = description.slice(0, MAX_DESCRIPTION_LENGTH_IN_NOTE) + '…';
    }

    return `${safeDescription}\n---\n${odmInfo}`;
  }

  /**
   * Creates a request that persists the (name, alias?) pairs ODM has written
   * into the imported range. Read back on the next refresh to delineate the
   * imported region and translate row-1 aliases back to canonical names so
   * the column diff is robust to user-friendly aliases configured in Output
   * Schema (see {@link GOOGLE_SHEETS_METADATA_KEYS.COLUMNS}).
   *
   * The serialized value is a JSON array of objects:
   *   `[{"name":"date","alias":"Date"},{"name":"cost"},…]`
   * `alias` is omitted when the column has no user-facing alias configured.
   */
  public createOwoxColumnsMetadataRequest(
    sheetId: number,
    columns: Array<{ name: string; alias?: string }>
  ): sheets_v4.Schema$Request {
    return {
      createDeveloperMetadata: {
        developerMetadata: {
          metadataKey: GOOGLE_SHEETS_METADATA_KEYS.COLUMNS,
          metadataValue: this.buildOwoxColumnsMetadataValue(columns),
          visibility: 'DOCUMENT',
          location: {
            sheetId,
          },
        },
      },
    };
  }

  /**
   * Creates a request that updates the existing column-list developer
   * metadata for a sheet (see {@link createOwoxColumnsMetadataRequest}).
   */
  public updateOwoxColumnsMetadataRequest(
    metadataId: number,
    columns: Array<{ name: string; alias?: string }>
  ): sheets_v4.Schema$Request {
    return {
      updateDeveloperMetadata: {
        dataFilters: [
          {
            developerMetadataLookup: {
              metadataId,
            },
          },
        ],
        developerMetadata: {
          metadataValue: this.buildOwoxColumnsMetadataValue(columns),
        },
        fields: 'metadataValue',
      },
    };
  }

  /**
   * Serializes the imported column list as a JSON array of `{ name, alias? }`
   * objects. `alias` is omitted from the serialized form when not provided so
   * the persisted payload stays minimal.
   */
  private buildOwoxColumnsMetadataValue(columns: Array<{ name: string; alias?: string }>): string {
    return JSON.stringify(
      columns.map(col =>
        col.alias !== undefined ? { name: col.name, alias: col.alias } : { name: col.name }
      )
    );
  }

  private buildOwoxMetadataValue(reportId: string, dataMartId: string, projectId: string): string {
    return JSON.stringify({ reportId, dataMartId, projectId });
  }
}
