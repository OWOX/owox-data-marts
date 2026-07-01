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
 * Conservative cap for the FINAL assembled note (description + separator +
 * ODM info block). Set below the Sheets 50,000-character cap so we never
 * hit "Cell note exceeds limit" rejections on the batchUpdate.
 *
 * The description-only guard above is not enough on its own: the ODM info
 * block embeds `dataMartTitle`, which is user-controlled and unbounded in
 * the DB schema. A pathologically-long title alone could push the note
 * past the limit even with no description.
 */
const MAX_TOTAL_NOTE_LENGTH = 49_500;

/**
 * Truncates a string to `maxChars` *Unicode code points* (not UTF-16 code
 * units), preserving surrogate-pair integrity so we never end up with a
 * half-emoji at the boundary. Returns the original string when it fits.
 */
function safeTruncate(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input;
  }
  // Array.from splits by code point — slicing here never lands inside a
  // surrogate pair. Always trim one extra character to reserve room for
  // the ellipsis marker the caller appends.
  return (
    Array.from(input)
      .slice(0, maxChars - 1)
      .join('') + '…'
  );
}

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
   * Builds the cell note written into every imported column *except* the first
   * one in the range: the column's own description followed by the short ODM
   * ownership marker. The marker signals the column is managed by OWOX Data
   * Marts; the full provenance block (timestamp, data mart title, link) is
   * reserved for the first column so it is not duplicated across every header.
   *
   * The description is placed first (so users see the relevant context
   * immediately), separated by a blank line from the marker; an empty
   * description collapses to the bare marker. The first column of the range
   * gets the full note from {@link buildImportedColumnNote} instead.
   */
  public buildImportedColumnMarker(
    description: string | undefined,
    isCommunityEdition: boolean
  ): string {
    return this.assembleColumnNote(description, this.buildOdmMarker(isCommunityEdition));
  }

  /**
   * The single-line ODM ownership marker, shared by the full first-column note
   * and the short marker written to the remaining columns so both read
   * identically: `--- Imported via OWOX Data Marts ---`.
   */
  private buildOdmMarker(isCommunityEdition: boolean): string {
    const editionSuffix = isCommunityEdition ? ' Community Edition' : '';
    return `--- Imported via OWOX Data Marts${editionSuffix} ---`;
  }

  /**
   * Builds the full cell-note text written into the FIRST imported column of
   * the data mart range (A1 of the range). Non-first columns get the column
   * description + short marker from {@link buildImportedColumnMarker} instead.
   *
   * The column's own description is placed first (so users see the relevant
   * context immediately), separated by a blank line from the ODM provenance
   * block — marker line, import date, data mart title, and link back to the
   * OWOX UI. If the description is empty or exceeds
   * {@link MAX_DESCRIPTION_LENGTH_IN_NOTE} characters, it is omitted or
   * truncated with an ellipsis to stay within Sheets' note size limit.
   */
  public buildImportedColumnNote(
    description: string | undefined,
    dataMartTitle: string,
    dataMartUrl: string,
    dateFormatted: string,
    isCommunityEdition: boolean
  ): string {
    const odmInfo =
      `${this.buildOdmMarker(isCommunityEdition)}\n` +
      `Imported at ${dateFormatted}\n` +
      `Data Mart: ${dataMartTitle}\n` +
      `Data Mart page: ${dataMartUrl}`;
    return this.assembleColumnNote(description, odmInfo);
  }

  /**
   * Assembles a per-cell note from the user's column description and an ODM
   * info block: the description first, a blank-line separator, then the block.
   * Shared by {@link buildImportedColumnNote} (full provenance block) and
   * {@link buildImportedColumnMarker} (bare marker) so both read identically
   * and apply the same size limits.
   *
   * An empty/undefined description collapses to just the info block (no leading
   * blank line). The description is truncated at
   * {@link MAX_DESCRIPTION_LENGTH_IN_NOTE}, and the whole assembled string is
   * capped at {@link MAX_TOTAL_NOTE_LENGTH} as a final safeguard against an
   * unbounded `dataMartTitle` embedded in the block.
   */
  private assembleColumnNote(description: string | undefined, infoBlock: string): string {
    let safeDescription = description ?? '';
    if (safeDescription.length > MAX_DESCRIPTION_LENGTH_IN_NOTE) {
      this.logger.warn(
        `Column description exceeds ${MAX_DESCRIPTION_LENGTH_IN_NOTE} chars; truncating before writing as cell note.`
      );
      safeDescription = safeTruncate(safeDescription, MAX_DESCRIPTION_LENGTH_IN_NOTE);
    }

    // Blank line between the user's description and the ODM block so the two
    // never read as one paragraph (the marker line provides the visual divider).
    const assembled = safeDescription ? `${safeDescription}\n\n${infoBlock}` : infoBlock;

    // H5 — Even with description truncated, the ODM info block can blow the
    // limit when `dataMartTitle` (user-controlled, unbounded) is huge. Cap
    // the entire assembled string as a final safeguard.
    if (assembled.length <= MAX_TOTAL_NOTE_LENGTH) {
      return assembled;
    }
    this.logger.warn(
      `Assembled imported-column note exceeds ${MAX_TOTAL_NOTE_LENGTH} chars ` +
        `(actual: ${assembled.length}); truncating to stay under the Sheets cell-note size cap.`
    );
    return safeTruncate(assembled, MAX_TOTAL_NOTE_LENGTH);
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
